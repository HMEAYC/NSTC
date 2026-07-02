import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from app.db.base import Base


class Child(Base):
    __tablename__ = "children"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=True)
    added_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    name = Column(String(100), nullable=False)
    student_id = Column(String(50), unique=True, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
