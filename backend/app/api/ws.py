from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.db.base import SessionLocal
from app.models.session import Session as SessionModel
from app.models.imu_data import IMUData

router = APIRouter(tags=["websocket"])

# In-memory pub/sub: session_id -> set of WebSocket clients (dashboard viewers)
_viewers: dict[str, set[WebSocket]] = {}


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
async def imu_data_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()

    # Register as viewer
    if session_id not in _viewers:
        _viewers[session_id] = set()
    _viewers[session_id].add(websocket)

    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            session = SessionModel(id=session_id, course_type="march", status="active")
            db.add(session)
            db.commit()

        await websocket.send_json({
            "type": "status",
            "session_id": session_id,
            "status": "connected",
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
                db.commit()

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

            await websocket.send_json({
                "type": "status",
                "session_id": session_id,
                "status": "ignored",
            })
    except WebSocketDisconnect:
        pass
    finally:
        _viewers.get(session_id, set()).discard(websocket)
        db.close()
