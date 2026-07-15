from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.auth.deps import require_role
from app.db.base import get_db
from app.models.wifi_config import WifiConfig
from app.models.user import User

router = APIRouter(prefix="/api/config", tags=["config"])


class WifiConfigUpdate(BaseModel):
    ssid: str
    password: Optional[str] = None
    device_id: Optional[str] = None  # None = global/fallback


@router.get("/wifi")
def get_wifi_config(
    include_password: bool = False,
    device_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    cfg = None
    if device_id:
        cfg = db.query(WifiConfig).filter(WifiConfig.device_id == device_id).first()
    if not cfg:
        cfg = db.query(WifiConfig).filter(WifiConfig.device_id.is_(None)).order_by(WifiConfig.updated_at.desc()).first()
    if not cfg:
        return {"ssid": None, "updated_at": None, "device_id": device_id}
    result = {"ssid": cfg.ssid, "updated_at": cfg.updated_at.isoformat(), "device_id": cfg.device_id}
    if include_password:
        result["password"] = cfg.password
    return result


@router.put("/wifi")
def set_wifi_config(
    payload: WifiConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("org_admin", "super_admin")),
):
    cfg = None
    if payload.device_id:
        cfg = db.query(WifiConfig).filter(WifiConfig.device_id == payload.device_id).first()
    if not cfg:
        cfg = db.query(WifiConfig).filter(WifiConfig.device_id.is_(None)).order_by(WifiConfig.updated_at.desc()).first()
    password = payload.password if payload.password is not None else (cfg.password if cfg else "")
    if not cfg:
        cfg = WifiConfig(
            ssid=payload.ssid,
            password=password,
            device_id=payload.device_id,
            updated_at=datetime.utcnow(),
        )
        db.add(cfg)
    else:
        cfg.ssid = payload.ssid
        cfg.password = password
        cfg.device_id = payload.device_id or cfg.device_id
        cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return {"ssid": cfg.ssid, "updated_at": cfg.updated_at.isoformat(), "device_id": cfg.device_id}
