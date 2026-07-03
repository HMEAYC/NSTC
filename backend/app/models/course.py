import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, JSON, ForeignKey
from app.db.base import Base


class Course(Base):
    __tablename__ = "courses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=True)
    template_id = Column(String(36), ForeignKey("course_templates.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    status = Column(
        Enum("draft", "scheduled", "active", "completed", "cancelled", name="course_status"),
        default="draft",
    )
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
