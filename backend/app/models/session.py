import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Integer, JSON, ForeignKey
from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=True)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=True)
    template_id = Column(String(36), ForeignKey("course_templates.id"), nullable=True)
    title = Column(String(200), nullable=True)
    group_name = Column(String(100), nullable=True)
    course_type = Column(Enum("march", "car", name="course_type"), nullable=False)
    child_info = Column(JSON, nullable=True)
    status = Column(Enum("active", "completed", name="session_status"), default="active")
    current_activity_index = Column(Integer, default=0)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
