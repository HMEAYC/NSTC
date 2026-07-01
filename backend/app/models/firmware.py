import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer
from app.db.base import Base


class FirmwareVersion(Base):
    __tablename__ = "firmware_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version = Column(String(32), nullable=False, unique=True)
    description = Column(String(500), nullable=True)
    binary_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
