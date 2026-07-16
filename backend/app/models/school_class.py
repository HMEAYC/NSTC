import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.db.base import Base


class SchoolClass(Base):
    __tablename__ = "classes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(100), nullable=False)
    grade = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
