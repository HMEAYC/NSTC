import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any

from app.auth.deps import require_login
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.child import Child as ChildModel
from app.models.imu_data import IMUData
from app.pairing import compute_pairing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["pairing"])


@router.post("/sessions/{session_id}/auto-pair")
def auto_pair(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"
    filters = [SessionModel.id == session_id]
    if not is_super:
        filters.append(SessionModel.org_id == effective_org_id(current_user))
    session = db.query(SessionModel).filter(*filters).first()
    if not session:
        raise HTTPException(404, "Session not found")

    class_children: list[ChildModel] = []
    if session.class_id:
        class_children = db.query(ChildModel).filter(
            ChildModel.class_id == session.class_id,
        ).all()
    if not class_children:
        raise HTTPException(400, "Session has no associated children")

    imu_data = db.query(IMUData).filter(
        IMUData.session_id == session_id,
    ).order_by(IMUData.timestamp).all()

    imu_signals: dict[str, list[dict[str, Any]]] = {}
    for row in imu_data:
        dev_id = row.device_id
        if dev_id not in imu_signals:
            imu_signals[dev_id] = []
        ts = row.timestamp.timestamp() * 1000 if isinstance(row.timestamp, datetime) else 0
        imu_signals[dev_id].append({
            "ts": ts,
            "ax": row.accel_x,
            "ay": row.accel_y,
            "az": row.accel_z,
            "gx": row.gyro_x,
            "gy": row.gyro_y,
            "gz": row.gyro_z,
        })

    if not imu_signals:
        raise HTTPException(400, "No IMU data available for this session")

    child_ids = [c.id for c in class_children]
    result = compute_pairing(imu_signals, child_ids, fs=50.0)

    return result
