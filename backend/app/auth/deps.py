from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.models.user import User
from app.models.device import Device
from app.auth.jwt import decode_token

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if payload.get("sub") == "device":
        return None
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def require_login(current_user: User | None = Depends(get_current_user)) -> User:
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return current_user


def _device_jwt_user(db: Session, payload: dict) -> User:
    device_id = payload.get("device_id")
    if not device_id:
        return None
    device = db.query(Device).filter(Device.device_id == device_id.upper()).first()
    if not device:
        return None
    user = db.query(User).filter(
        User.org_id == device.org_id,
        User.is_active == True,
    ).order_by(User.created_at).first()
    return user


async def require_device_or_user(
    current_user: User | None = Depends(get_current_user),
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> User:
    if current_user is not None:
        return current_user
    if authorization and authorization.startswith("Bearer "):
        payload = decode_token(authorization[7:])
        if payload and payload.get("sub") == "device":
            user = _device_jwt_user(db, payload)
            if user:
                return user
    if settings.hmeayc_api_key and x_api_key and x_api_key.strip() == settings.hmeayc_api_key:
        user = db.query(User).filter(User.is_active == True, User.role != "super_admin").order_by(User.created_at).first()
        if user is None:
            user = db.query(User).filter(User.is_active == True).first()
        if user is None:
            raise HTTPException(status_code=500, detail="No active users in system")
        return user
    raise HTTPException(status_code=401, detail="Authentication required")


def require_role(*roles: str):
    async def check(current_user: User = Depends(require_login)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return check


def same_org(org_id: str, current_user: User = Depends(require_login)) -> None:
    if current_user.role == "super_admin":
        return
    if str(current_user.org_id) != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-org access denied")
