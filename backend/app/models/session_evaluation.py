import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint
from app.db.base import Base


class SessionEvaluation(Base):
    __tablename__ = "session_evaluations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    score = Column(Float, nullable=True)
    comment = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("session_id", "child_id", name="uq_session_child"),
    )
