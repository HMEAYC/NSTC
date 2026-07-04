from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc, func

from app.auth import require_api_key
from app.auth.deps import get_current_user, require_role
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.session import Session as SessionModel
from app.models.course_template import CourseTemplate
from app.models.imu_data import IMUData
from app.models.analysis_result import AnalysisResult
from app.models.report import Report
from app.models.device_assignment import DeviceAssignment
from app.models.user import User

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _session_filter(session_model, user: User | None):
    org_id = effective_org_id(user)
    filters = [session_model.org_id == org_id]
    if user is not None and user.role == "teacher":
        filters.append(session_model.teacher_id == user.id)
    return filters


@router.get("")
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    filters = _session_filter(SessionModel, current_user)
    sessions = (
        db.query(
            SessionModel,
            func.count(IMUData.id).label("imu_count"),
            func.count(func.distinct(IMUData.device_id)).label("device_count"),
        )
        .outerjoin(IMUData, IMUData.session_id == SessionModel.id)
        .filter(*filters)
        .group_by(SessionModel.id)
        .order_by(desc(SessionModel.start_time))
        .limit(100)
        .all()
    )
    result = []
    for s, imu_count, device_count in sessions:
        duration = None
        if s.start_time and s.end_time:
            duration = (s.end_time - s.start_time).total_seconds()
        elif s.start_time:
            duration = (datetime.utcnow() - s.start_time).total_seconds()
        result.append({
            "id": s.id,
            "course_type": s.course_type,
            "status": s.status,
            "started_at": s.start_time.isoformat() if s.start_time else None,
            "ended_at": s.end_time.isoformat() if s.end_time else None,
            "duration_sec": round(duration) if duration else None,
            "imu_count": imu_count,
            "device_count": device_count,
            "title": s.title,
            "template_id": s.template_id,
        })
    return {"sessions": result}


class CreateSessionRequest(BaseModel):
    course_type: str = "march"
    template_id: str | None = None
    title: str | None = None


@router.post("")
def create_session(
    body: CreateSessionRequest,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = SessionModel(
        course_type=body.course_type,
        template_id=body.template_id,
        title=body.title,
        org_id=org_id,
        teacher_id=current_user.id if current_user else None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "course_type": session.course_type,
        "template_id": session.template_id,
        "start_time": session.start_time.isoformat(),
    }


@router.post("/{session_id}/end")
def end_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    filters = [SessionModel.id == session_id]
    org_id = effective_org_id(current_user)
    filters.append(SessionModel.org_id == org_id)
    session = db.query(SessionModel).filter(*filters).first()
    if not session:
        raise HTTPException(404, "Session not found")
    session.status = "completed"
    session.end_time = datetime.utcnow()
    db.commit()
    return {"status": "completed", "ended_at": session.end_time.isoformat()}


@router.delete("/{session_id}")
def delete_session(
    session_id: str,
    _: None = Depends(require_api_key),
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    db.query(DeviceAssignment).filter(
        DeviceAssignment.session_id == session_id
    ).delete(synchronize_session=False)
    db.query(AnalysisResult).filter(
        AnalysisResult.session_id == session_id
    ).delete(synchronize_session=False)
    db.query(Report).filter(
        Report.session_id == session_id
    ).delete(synchronize_session=False)
    db.query(IMUData).filter(
        IMUData.session_id == session_id
    ).delete(synchronize_session=False)
    db.delete(session)
    db.commit()
    return {"status": "deleted", "session_id": session_id}


@router.get("/{session_id}")
def get_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    imu_count = db.query(func.count(IMUData.id)).filter(
        IMUData.session_id == session_id
    ).scalar() or 0
    device_count = db.query(func.count(func.distinct(IMUData.device_id))).filter(
        IMUData.session_id == session_id
    ).scalar() or 0

    # Resolve template activities
    template_activities = []
    if session.template_id:
        tmpl = db.query(CourseTemplate).filter(
            CourseTemplate.id == session.template_id
        ).first()
        if tmpl and tmpl.stages:
            stages_data = tmpl.stages
            if isinstance(stages_data, list) and len(stages_data) > 0:
                template_activities = stages_data[0].get("activities", []) or []

    return {
        "id": session.id,
        "course_type": session.course_type,
        "template_id": session.template_id,
        "status": session.status,
        "current_activity_index": session.current_activity_index or 0,
        "template_activities": template_activities,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "imu_count": imu_count,
        "device_count": device_count,
    }


class UpdateActivityRequest(BaseModel):
    current_activity_index: int


@router.put("/{session_id}/activity")
def update_activity(
    session_id: str,
    body: UpdateActivityRequest,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    session.current_activity_index = body.current_activity_index
    db.commit()
    return {"current_activity_index": session.current_activity_index}


@router.get("/{session_id}/analysis")
def get_analysis(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

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



