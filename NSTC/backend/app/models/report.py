import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Enum, ForeignKey
from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    content = Column(JSON, nullable=True)
    status = Column(Enum("pending", "done", "failed", name="report_status"), default="pending")
