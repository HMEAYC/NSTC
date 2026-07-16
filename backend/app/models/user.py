import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Enum, ForeignKey
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=True)
    display_name = Column(String(100), nullable=True)
    role = Column(Enum("super_admin", "org_admin", "teacher", "parent", name="user_role"), nullable=False)
    is_active = Column(Boolean, default=True)
    invite_token = Column(String(36), unique=True, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
