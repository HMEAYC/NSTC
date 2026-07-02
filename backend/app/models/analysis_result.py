import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, JSON, ForeignKey
from app.db.base import Base


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    rhythm_sync_rate = Column(Float, nullable=True)
    freeze_reaction_time = Column(Float, nullable=True)
    freeze_stability_score = Column(Float, nullable=True)
    raw_data = Column(JSON, nullable=True)
