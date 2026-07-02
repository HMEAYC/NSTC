import uuid
from sqlalchemy import Column, String, ForeignKey, UniqueConstraint
from app.db.base import Base


class TeacherClass(Base):
    __tablename__ = "teacher_classes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("teacher_id", "class_id", name="uq_teacher_class"),
    )
