from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.db.base import SessionLocal
from app.models.session import Session as SessionModel
from app.models.imu_data import IMUData

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{session_id}")
async def imu_data_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
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
            frame = IMUData(
                session_id=session_id,
                device_id=data.get("device_id", "esp32-c3"),
                timestamp=datetime.utcfromtimestamp(ts),
                accel_x=data.get("ax", 0.0),
                accel_y=data.get("ay", 0.0),
                accel_z=data.get("az", 0.0),
                gyro_x=data.get("gx", 0.0),
                gyro_y=data.get("gy", 0.0),
                gyro_z=data.get("gz", 0.0),
            )
            db.add(frame)
            db.commit()
            await websocket.send_json({"status": "ok", "session_id": session_id})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
