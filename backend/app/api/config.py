from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.auth.deps import get_current_user, require_login
from app.db.base import get_db
from app.models.wifi_config import WifiConfig
from app.models.user import User

router = APIRouter(prefix="/api/config", tags=["config"])


class WifiConfigUpdate(BaseModel):
    ssid: str
    password: Optional[str] = None


@router.get("/wifi")
def get_wifi_config(
    include_password: bool = False,
    db: Session = Depends(get_db),
):
    cfg = db.query(WifiConfig).order_by(WifiConfig.updated_at.desc()).first()
    if not cfg:
        return {"ssid": None, "updated_at": None}
    result = {"ssid": cfg.ssid, "updated_at": cfg.updated_at.isoformat()}
    if include_password:
        result["password"] = cfg.password
    return result


@router.put("/wifi")
def set_wifi_config(
    payload: WifiConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_login),
):
    cfg = db.query(WifiConfig).order_by(WifiConfig.updated_at.desc()).first()
    password = payload.password if payload.password is not None else (cfg.password if cfg else "")
    if not cfg:
        cfg = WifiConfig(ssid=payload.ssid, password=password, updated_at=datetime.utcnow())
        db.add(cfg)
    else:
        cfg.ssid = payload.ssid
        cfg.password = password
        cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return {"ssid": cfg.ssid, "updated_at": cfg.updated_at.isoformat()}
