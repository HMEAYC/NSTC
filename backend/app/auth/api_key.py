from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException

from app.config import settings


def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    if not settings.hmeayc_api_key:
        return
    if not x_api_key or x_api_key.strip() != settings.hmeayc_api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
