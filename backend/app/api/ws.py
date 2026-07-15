import asyncio
import logging
import time
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.auth.jwt import decode_token
from app.auth.org import effective_org_id
from app.db.base import SessionLocal
from app.models.session import Session as SessionModel
from app.models.imu_data import IMUData
from app.models.device import Device as DeviceModel
from app.analysis.realtime import RealtimeAnalyzer

router = APIRouter(tags=["websocket"])

_viewers: dict[str, set[WebSocket]] = {}
_analyzers: dict[str, RealtimeAnalyzer] = {}
_cleanup_started = False


async def _cleanup_loop():
    """Periodically ping all viewers and remove stale connections."""
    while True:
        await asyncio.sleep(30)
        for session_id, viewers in list(_viewers.items()):
            for ws in list(viewers):
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    viewers.discard(ws)
            if not viewers:
                _viewers.pop(session_id, None)


def _ensure_cleanup():
    global _cleanup_started
    if not _cleanup_started:
        _cleanup_started = True
        asyncio.create_task(_cleanup_loop())


async def broadcast_to_session(session_id: str, message: dict) -> None:
    """Broadcast a message to all viewers of a session (used by REST endpoints)."""
    viewers = list(_viewers.get(session_id, set()))
    for ws in viewers:
        try:
            await ws.send_json(message)
        except Exception:
            _viewers.get(session_id, set()).discard(ws)


def _normalize_message(data: Any, device_id_default: str) -> Optional[dict[str, Any]]:
    if not isinstance(data, dict):
        return None
    message_type = str(data.get("type") or ("imu" if "ax" in data else "status"))
    if message_type == "imu" or "ax" in data:
        return {
            "type": "imu",
            "ts": data.get("ts", datetime.utcnow().timestamp() * 1000),
            "device_id": data.get("device_id", device_id_default),
            "ax": data.get("ax", 0.0),
            "ay": data.get("ay", 0.0),
            "az": data.get("az", 0.0),
            "gx": data.get("gx", 0.0),
            "gy": data.get("gy", 0.0),
            "gz": data.get("gz", 0.0),
        }
    if message_type == "analysis":
        payload = dict(data)
        payload["type"] = "analysis"
        return payload
    if message_type == "status":
        payload = dict(data)
        payload["type"] = "status"
        return payload
    return None


@router.websocket("/ws/{session_id}")
async def imu_data_ws(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(default=""),
):
    await websocket.accept()
    _ensure_cleanup()

    client_host = websocket.client.host if websocket.client else "unknown"
    print(f"WS CONNECTION: {client_host} session={session_id}", flush=True)
    logger.info("connection open from %s for session %s", client_host, session_id)

    if session_id not in _viewers:
        _viewers[session_id] = set()
    _viewers[session_id].add(websocket)

    user_org_id = None
    if token:
        payload = decode_token(token)
        if payload:
            user_org_id = payload.get("org_id")
    resolved_org = user_org_id or None

    db = SessionLocal()
    frame_count = 0
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            session = SessionModel(
                id=session_id,
                course_type="march",
                status="active",
                org_id=resolved_org or "00000000-0000-0000-0000-000000000001",
            )
            db.add(session)
            db.commit()

        await websocket.send_json({
            "type": "status",
            "session_id": session_id,
            "status": "connected",
        })

        # Initialize real-time analyzer if session has music data
        analyzer: RealtimeAnalyzer | None = None
        if session.music_bpm:
            analyzer = RealtimeAnalyzer(
                bpm=session.music_bpm,
                beat_times=session.music_beat_times or [],
                stop_times=session.music_stop_times or [],
                music_duration=session.music_duration or 0,
            )
            _analyzers[session_id] = analyzer
            await websocket.send_json({
                "type": "music",
                "session_id": session_id,
                "music_bpm": session.music_bpm,
                "music_beat_times": session.music_beat_times or [],
                "music_stop_times": session.music_stop_times or [],
                "music_duration": session.music_duration or 0,
                "music_element": session.music_element,
            })

        while True:
            raw = await websocket.receive_json()
            data = _normalize_message(raw, "esp32-c3")
            if data is None:
                await websocket.send_json({
                    "type": "status",
                    "session_id": session_id,
                    "status": "ignored",
                    "reason": "unsupported_message",
                })
                continue

            if data["type"] == "imu":
                ts = float(data.get("ts", datetime.utcnow().timestamp() * 1000))
                frame = IMUData(
                    session_id=session_id,
                    device_id=str(data.get("device_id", "esp32-c3")),
                    timestamp=datetime.utcfromtimestamp(ts / 1000.0),
                    accel_x=float(data.get("ax", 0.0)),
                    accel_y=float(data.get("ay", 0.0)),
                    accel_z=float(data.get("az", 0.0)),
                    gyro_x=float(data.get("gx", 0.0)),
                    gyro_y=float(data.get("gy", 0.0)),
                    gyro_z=float(data.get("gz", 0.0)),
                )
                db.add(frame)
                frame_count += 1
                if frame_count % 100 == 0:
                    device_id = str(data.get("device_id", ""))
                    if device_id:
                        db.query(DeviceModel).filter(
                            DeviceModel.device_id == device_id
                        ).update({"active_session_id": session_id})
                    db.commit()

                # Real-time music analysis
                if analyzer is not None:
                    result = analyzer.ingest(data)
                    if result is not None:
                        viewers = list(_viewers.get(session_id, set()))
                        for viewer in viewers:
                            try:
                                await viewer.send_json(result)
                            except Exception:
                                _viewers.get(session_id, set()).discard(viewer)

                # broadcast without waiting for DB write
                viewers = list(_viewers.get(session_id, set()))
                for viewer in viewers:
                    if viewer is websocket:
                        continue
                    try:
                        await viewer.send_json(data)
                    except Exception:
                        _viewers.get(session_id, set()).discard(viewer)

                await websocket.send_json({
                    "type": "status",
                    "session_id": session_id,
                    "status": "ok",
                })
                continue

            if data["type"] == "analysis":
                viewers = list(_viewers.get(session_id, set()))
                for viewer in viewers:
                    if viewer is websocket:
                        continue
                    try:
                        await viewer.send_json(data)
                    except Exception:
                        _viewers.get(session_id, set()).discard(viewer)
                await websocket.send_json({
                    "type": "status",
                    "session_id": session_id,
                    "status": "ok",
                })
                continue

            if data["type"] == "music_start":
                # Teacher pressed play — record start timestamp for IMU alignment
                if analyzer is not None:
                    ts = float(data.get("ts", time.time() * 1000))
                    analyzer.set_music_start(ts)
                    viewers = list(_viewers.get(session_id, set()))
                    for viewer in viewers:
                        try:
                            await viewer.send_json({
                                "type": "music_start",
                                "session_id": session_id,
                                "ts": ts,
                            })
                        except Exception:
                            _viewers.get(session_id, set()).discard(viewer)
                await websocket.send_json({
                    "type": "status",
                    "session_id": session_id,
                    "status": "ok",
                })
                continue

            await websocket.send_json({
                "type": "status",
                "session_id": session_id,
                "status": "ignored",
            })
    except WebSocketDisconnect:
        print(f"WS DISCONNECT: {client_host}", flush=True)
        logger.info("WebSocket disconnected from %s", client_host)
    except Exception:
        import traceback
        traceback.print_exc()
        logger.exception("WebSocket error from %s", client_host)
        db.rollback()
    finally:
        _viewers.get(session_id, set()).discard(websocket)
        if session_id in _analyzers and not _viewers.get(session_id, set()):
            _analyzers.pop(session_id, None)
        try:
            db.commit()
        except Exception:
            db.rollback()
        db.close()
