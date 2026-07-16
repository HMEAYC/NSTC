import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.auth.jwt import decode_token
from app.db.base import SessionLocal
from app.models.session import Session as SessionModel
from app.models.imu_data import IMUData
from app.models.device import Device as DeviceModel
from app.models.analysis_result import AnalysisResult
from app.analysis.realtime import RealtimeAnalyzer
from app.analysis.realtime_video import RealtimeVideoAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

_viewers: dict[str, set[WebSocket]] = {}
_analyzers: dict[str, RealtimeAnalyzer] = {}
_video_analyzers: dict[str, RealtimeVideoAnalyzer] = {}
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
            "ts": data.get("ts", datetime.now(timezone.utc).timestamp() * 1000),
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
                "music_url": session.music_url,
            })

        while True:
            raw_msg = await websocket.receive()

            # Handle binary camera frames
            if raw_msg.get("type") == "websocket.receive" and raw_msg.get("bytes"):
                jpeg_bytes = raw_msg["bytes"]
                if session_id in _video_analyzers:
                    try:
                        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
                        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        if frame is not None:
                            result = _video_analyzers[session_id].ingest_frame(frame)
                            if result is not None:
                                # Persist CV metrics if present
                                if "cv_metrics" in result:
                                    try:
                                        ar = AnalysisResult(
                                            id=str(uuid4()),
                                            session_id=session_id,
                                            child_id=None,
                                            raw_data={"cv_metrics": result["cv_metrics"], "person_count": result.get("person_count", 0)},
                                        )
                                        db.add(ar)
                                        db.commit()
                                    except Exception:
                                        db.rollback()
                                        logger.exception("Failed to persist CV metrics")
                                # Broadcast to all viewers
                                viewers = list(_viewers.get(session_id, set()))
                                for viewer in viewers:
                                    try:
                                        await viewer.send_json(result)
                                    except Exception:
                                        _viewers.get(session_id, set()).discard(viewer)
                    except Exception:
                        logger.exception("Failed to process camera frame")
                continue

            # Handle text JSON messages
            if raw_msg.get("type") != "websocket.receive" or not raw_msg.get("text"):
                continue

            try:
                raw = json.loads(raw_msg["text"])
            except Exception:
                continue

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
                ts = float(data.get("ts", datetime.now(timezone.utc).timestamp() * 1000))
                frame = IMUData(
                    session_id=session_id,
                    device_id=str(data.get("device_id", "esp32-c3")),
                    timestamp=datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc),
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
                        # Persist analysis result to DB
                        try:
                            device_id = str(data.get("device_id", ""))
                            if result["type"] == "rhythm_update":
                                ar = AnalysisResult(
                                    id=str(uuid4()),
                                    session_id=session_id,
                                    child_id=None,
                                    rhythm_sync_rate=result.get("sync_rate"),
                                    raw_data={"bpm": result.get("bpm"), "peak_count": result.get("peak_count"), "beat_count": result.get("beat_count")},
                                )
                                db.add(ar)
                                db.commit()
                            elif result["type"] == "freeze_update":
                                ar = AnalysisResult(
                                    id=str(uuid4()),
                                    session_id=session_id,
                                    child_id=None,
                                    freeze_reaction_time=result.get("reaction_time"),
                                    freeze_stability_score=result.get("stability_score"),
                                    raw_data={"stop_time": result.get("stop_time")},
                                )
                                db.add(ar)
                                db.commit()
                        except Exception:
                            db.rollback()
                            logger.exception("Failed to persist analysis result")

                        # Broadcast to viewers
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

            if data["type"] == "camera_start":
                # Initialize real-time video analyzer
                if session_id not in _video_analyzers:
                    try:
                        _video_analyzers[session_id] = RealtimeVideoAnalyzer()
                        logger.info("RealtimeVideoAnalyzer initialized for session %s", session_id)
                    except Exception:
                        logger.exception("Failed to initialize RealtimeVideoAnalyzer")
                        await websocket.send_json({
                            "type": "status",
                            "session_id": session_id,
                            "status": "error",
                            "reason": "video_analyzer_init_failed",
                        })
                        continue
                await websocket.send_json({
                    "type": "camera_status",
                    "session_id": session_id,
                    "status": "streaming",
                })
                continue

            if data["type"] == "camera_stop":
                _video_analyzers.pop(session_id, None)
                await websocket.send_json({
                    "type": "camera_status",
                    "session_id": session_id,
                    "status": "stopped",
                })
                continue

            await websocket.send_json({
                "type": "status",
                "session_id": session_id,
                "status": "ignored",
            })
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected from %s", client_host)
    except Exception:
        logger.exception("WebSocket error from %s", client_host)
        db.rollback()
    finally:
        _viewers.get(session_id, set()).discard(websocket)
        if session_id in _analyzers and not _viewers.get(session_id, set()):
            _analyzers.pop(session_id, None)
        if session_id in _video_analyzers and not _viewers.get(session_id, set()):
            _video_analyzers.pop(session_id, None)
        try:
            db.commit()
        except Exception:
            db.rollback()
        db.close()
