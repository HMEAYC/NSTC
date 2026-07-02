import uuid
from sqlalchemy import Column, String, ForeignKey, UniqueConstraint
from app.db.base import Base


class ParentChild(Base):
    __tablename__ = "parent_children"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    parent_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("parent_id", "child_id", name="uq_parent_child"),
    )
