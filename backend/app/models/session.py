import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Integer, JSON, ForeignKey, Text, Float
from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=True)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    template_id = Column(String(36), ForeignKey("session_templates.id"), nullable=True)
    name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    title = Column(String(200), nullable=True)
    group_name = Column(String(100), nullable=True)
    course_type = Column(Enum("march", "car", name="course_type"), nullable=False)
    child_info = Column(JSON, nullable=True)
    status = Column(
        Enum("draft", "scheduled", "active", "completed", "cancelled", name="session_status"),
        default="draft",
    )
    current_activity_index = Column(Integer, default=0)
    scheduled_at = Column(DateTime, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    music_file = Column(String(500), nullable=True)
    music_bpm = Column(Float, nullable=True)
    music_beat_times = Column(JSON, nullable=True)
    music_stop_times = Column(JSON, nullable=True)
    music_duration = Column(Float, nullable=True)
    music_element = Column(String(100), nullable=True)
    music_url = Column(String(1000), nullable=True)
