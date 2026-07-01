from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.base import get_db
from app.models.session import Session as SessionModel
from app.models.analysis_result import AnalysisResult
from app.models.report import Report

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
def list_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(SessionModel)
        .order_by(desc(SessionModel.start_time))
        .limit(100)
        .all()
    )
    return {
        "sessions": [
            {
                "id": s.id,
                "device_id": "",
                "started_at": s.start_time.isoformat() if s.start_time else "",
                "ended_at": s.end_time.isoformat() if s.end_time else None,
                "status": s.status,
            }
            for s in sessions
        ]
    }


@router.post("")
def create_session(
    course_type: str = "march",
    db: Session = Depends(get_db),
):
    session = SessionModel(course_type=course_type)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "course_type": session.course_type,
        "start_time": session.start_time.isoformat(),
    }


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "id": session.id,
        "course_type": session.course_type,
        "status": session.status,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
    }


@router.get("/{session_id}/analysis")
def get_analysis(session_id: str, db: Session = Depends(get_db)):
    results = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.session_id == session_id)
        .all()
    )
    return {
        "results": [
            {
                "id": r.id,
                "type": "rhythm" if r.rhythm_sync_rate is not None else "freeze",
                "rhythm_sync_rate": r.rhythm_sync_rate,
                "freeze_reaction_time": r.freeze_reaction_time,
                "freeze_stability_score": r.freeze_stability_score,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in results
        ]
    }


@router.post("/{session_id}/report")
def generate_report(session_id: str, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    report = Report(session_id=session_id, content={"markdown": "# Report\n\nNo data."})
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"report": {"id": report.id}}


@router.get("/{session_id}/report")
def get_session_report(session_id: str, db: Session = Depends(get_db)):
    report = (
        db.query(Report).filter(Report.session_id == session_id).first()
    )
    if not report:
        raise HTTPException(404, "Report not found")
    return {
        "id": report.id,
        "session_id": report.session_id,
        "report_type": "educational",
        "markdown": (report.content or {}).get("markdown", ""),
    }
