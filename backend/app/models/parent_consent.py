import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Text
from app.db.base import Base


class ParentConsent(Base):
    __tablename__ = "parent_consents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id = Column(String(36), ForeignKey("children.id"), nullable=False)
    parent_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    consented = Column(Boolean, nullable=False)
    consent_file_path = Column(String(500), nullable=True)
    consented_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
