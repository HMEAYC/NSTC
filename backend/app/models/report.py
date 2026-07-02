import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Enum, ForeignKey, Text
from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=True)
    generated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
    markdown = Column(Text, nullable=True)
    pdf_path = Column(String(500), nullable=True)
    content = Column(JSON, nullable=True)
    status = Column(Enum("pending", "done", "failed", name="report_status"), default="pending")
