import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean
from app.db.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    contact_email = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
