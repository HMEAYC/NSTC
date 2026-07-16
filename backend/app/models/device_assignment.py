import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint
from app.db.base import Base


class DeviceAssignment(Base):
    __tablename__ = "device_assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=False)
    confidence = Column(Float, nullable=True)
    method = Column(String(32), default="manual")
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("session_id", "device_id", name="uq_session_device"),
    )
