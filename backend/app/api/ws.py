from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{session_id}")
async def imu_data_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            # TODO: process and store IMU data
            await websocket.send_json({"status": "ok", "session_id": session_id})
    except WebSocketDisconnect:
        pass
