from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.db.base import SessionLocal
from app.models.session import Session as SessionModel
from app.models.imu_data import IMUData

router = APIRouter(tags=["websocket"])

# In-memory pub/sub: session_id -> set of WebSocket clients (dashboard viewers)
_viewers: dict[str, set[WebSocket]] = {}

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

        while True:
            data = await websocket.receive_json()
            ts = data.get("ts", datetime.utcnow().timestamp())
            device_id = data.get("device_id", "esp32-c3")

            # If this is IMU data (has ax/ay/az), store it and broadcast
            if "ax" in data:
                frame = IMUData(
                    session_id=session_id,
                    device_id=device_id,
                    timestamp=datetime.utcfromtimestamp(ts / 1000.0),
                    accel_x=data.get("ax", 0.0),
                    accel_y=data.get("ay", 0.0),
                    accel_z=data.get("az", 0.0),
                    gyro_x=data.get("gx", 0.0),
                    gyro_y=data.get("gy", 0.0),
                    gyro_z=data.get("gz", 0.0),
                )
                db.add(frame)
                db.commit()

                # Broadcast to all viewers of this session
                disconnected = set()
                for viewer in _viewers.get(session_id, set()):
                    if viewer is websocket:
                        continue
                    try:
                        await viewer.send_json(data)
                    except Exception:
                        disconnected.add(viewer)
                _viewers[session_id] -= disconnected

            await websocket.send_json({"status": "ok", "session_id": session_id})
    except WebSocketDisconnect:
        pass
    finally:
        _viewers.get(session_id, set()).discard(websocket)
        db.close()
