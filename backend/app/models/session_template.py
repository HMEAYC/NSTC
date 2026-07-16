import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey
from app.db.base import Base


class SessionTemplate(Base):
    __tablename__ = "session_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    stages = Column(JSON, nullable=True)
    metrics_config = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
