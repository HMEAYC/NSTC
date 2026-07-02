from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException

_API_KEY = (os.environ.get("HMEAYC_API_KEY") or "").strip()


def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    if not _API_KEY:
        return
    if not x_api_key or x_api_key.strip() != _API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
