import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, ForeignKey, UniqueConstraint
from app.db.base import Base


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=True)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=True)

    activity_level = Column(Float, nullable=True)
    smoothness = Column(Float, nullable=True)
    stability_index = Column(Float, nullable=True)
    sample_count = Column(Integer, nullable=True)
    window_seconds = Column(Float, nullable=True)

    computed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("session_id", "device_id", "child_id",
                         name="uq_assessment_session_device_child"),
    )
