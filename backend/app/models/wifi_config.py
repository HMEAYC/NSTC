import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from app.db.base import Base


class WifiConfig(Base):
    __tablename__ = "wifi_config"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id = Column(String(64), nullable=True, index=True)  # None = global/fallback
    ssid = Column(String(100), nullable=False)
    password = Column(String(256), nullable=False, default="")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
