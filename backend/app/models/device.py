import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, Enum, ForeignKey
from app.db.base import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    device_id = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    firmware_version = Column(String(32), nullable=True)
    battery_level = Column(Float, nullable=True)
    status = Column(Enum("online", "offline", name="device_status"), default="offline")
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
