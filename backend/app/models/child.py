import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from app.db.base import Base


class Child(Base):
    __tablename__ = "children"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    student_id = Column(String(50), unique=True, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
