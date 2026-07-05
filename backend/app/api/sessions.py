from __future__ import annotations

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
from app.models.session_template import SessionTemplate
from app.models.session_evaluation import SessionEvaluation
from app.models.school_class import SchoolClass
from app.models.imu_data import IMUData
from app.models.analysis_result import AnalysisResult
from app.models.assessment_result import AssessmentResult
from app.models.report import Report
from app.models.device_assignment import DeviceAssignment
from app.models.user import User
from app.models.child import Child

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── Schemas ────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    name: str
    class_id: str | None = None
    template_id: str | None = None
    description: str | None = None
    scheduled_at: str | None = None
    course_type: str = "march"


class UpdateSessionRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    class_id: str | None = None
    template_id: str | None = None
    scheduled_at: str | None = None


class UpdateActivityRequest(BaseModel):
    current_activity_index: int


class UpsertEvaluationRequest(BaseModel):
    score: float | None = None
    comment: str | None = None


# ─── Helpers ────────────────────────────────────────────────────────

def _session_filter(session_model, user: User | None):
    org_id = effective_org_id(user)
    filters = [session_model.org_id == org_id]
    if user is not None and user.role == "teacher":
        filters.append(session_model.teacher_id == user.id)
    return filters


def _serialize(s: SessionModel) -> dict:
    return {
        "id": s.id,
        "org_id": s.org_id,
        "class_id": s.class_id,
        "template_id": s.template_id,
        "name": s.name,
        "description": s.description,
        "status": s.status,
        "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
        "started_at": s.start_time.isoformat() if s.start_time else None,
        "ended_at": s.end_time.isoformat() if s.end_time else None,
    }


def _serialize_evaluation(ev: SessionEvaluation, child_name: str | None = None) -> dict:
    return {
        "child_id": ev.child_id,
        "child_name": child_name or "Unknown",
        "score": ev.score,
        "comment": ev.comment,
        "teacher_id": ev.teacher_id,
    }


# ─── List / Create ─────────────────────────────────────────────────

@router.get("")
def list_sessions(
    status: str | None = None,
    class_id: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    filters = _session_filter(SessionModel, current_user)
    if status:
        filters.append(SessionModel.status == status)
    if class_id:
        filters.append(SessionModel.class_id == class_id)
    sessions = (
        db.query(SessionModel)
        .filter(*filters)
        .order_by(desc(SessionModel.scheduled_at), desc(SessionModel.start_time))
        .all()
    )
    return {"sessions": [_serialize(s) for s in sessions]}


@router.post("")
def create_session(
    body: CreateSessionRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    parsed_scheduled = None
    if body.scheduled_at:
        parsed_scheduled = datetime.fromisoformat(body.scheduled_at)

    session = SessionModel(
        org_id=org_id,
        class_id=body.class_id,
        template_id=body.template_id,
        name=body.name,
        description=body.description,
        course_type=body.course_type,
        scheduled_at=parsed_scheduled,
        status="draft",
        teacher_id=current_user.id if current_user else None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session": _serialize(session)}


# ─── Get / Update / Delete ─────────────────────────────────────────

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

    result = _serialize(session)

    if session.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == session.class_id).first()
        result["class_name"] = cls.name if cls else None
    else:
        result["class_name"] = None

    if session.template_id:
        tpl = db.query(SessionTemplate).filter(SessionTemplate.id == session.template_id).first()
        result["template_name"] = tpl.name if tpl else None
    else:
        result["template_name"] = None

    imu_count = db.query(func.count(IMUData.id)).filter(
        IMUData.session_id == session_id
    ).scalar() or 0
    device_count = db.query(func.count(func.distinct(IMUData.device_id))).filter(
        IMUData.session_id == session_id
    ).scalar() or 0

    # Resolve template activities
    template_activities = []
    if session.template_id:
        tmpl = db.query(SessionTemplate).filter(
            SessionTemplate.id == session.template_id
        ).first()
        if tmpl and tmpl.stages:
            stages_data = tmpl.stages
            if isinstance(stages_data, list) and len(stages_data) > 0:
                template_activities = stages_data[0].get("activities", []) or []

    result["current_activity_index"] = session.current_activity_index or 0
    result["template_activities"] = template_activities
    result["imu_count"] = imu_count
    result["device_count"] = device_count

    return {"session": result}


@router.put("/{session_id}")
def update_session(
    session_id: str,
    body: UpdateSessionRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.status not in ("draft", "scheduled"):
        raise HTTPException(400, "Only draft or scheduled sessions can be edited")

    if body.name is not None:
        session.name = body.name
    if body.description is not None:
        session.description = body.description
    if body.class_id is not None:
        session.class_id = body.class_id
    if body.template_id is not None:
        session.template_id = body.template_id
    if body.scheduled_at is not None:
        session.scheduled_at = datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else None

    db.commit()
    db.refresh(session)
    return {"session": _serialize(session)}


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
    if session.status not in ("draft", "cancelled"):
        raise HTTPException(400, "Only draft or cancelled sessions can be deleted")

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


# ─── Start / End ────────────────────────────────────────────────────

@router.post("/{session_id}/start")
def start_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.status not in ("draft", "scheduled"):
        raise HTTPException(400, f"Cannot start session with status '{session.status}'")

    session.status = "active"
    session.start_time = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return {"session": _serialize(session)}


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
    return {"session": _serialize(session)}


# ─── Activity ──────────────────────────────────────────────────────

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


# ─── Analysis ──────────────────────────────────────────────────────

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


# ─── Evaluations ────────────────────────────────────────────────────

@router.get("/{session_id}/evaluations")
def list_evaluations(
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

    evaluations = (
        db.query(SessionEvaluation)
        .filter(SessionEvaluation.session_id == session_id)
        .all()
    )
    eval_map = {e.child_id: e for e in evaluations}
    child_ids = [e.child_id for e in evaluations]

    # Include class children if no evaluations yet
    if not child_ids and session.class_id:
        class_children = (
            db.query(Child)
            .filter(Child.class_id == session.class_id)
            .all()
        )
        child_list = class_children
    else:
        child_list = db.query(Child).filter(Child.id.in_(child_ids)).all() if child_ids else []

    result = []
    for child in child_list:
        ev = eval_map.get(child.id)
        result.append(_serialize_evaluation(ev, child.name) if ev else {
            "child_id": child.id,
            "child_name": child.name,
            "score": None,
            "comment": None,
            "teacher_id": None,
        })
    return {"evaluations": result}


@router.put("/{session_id}/evaluations/{child_id}")
def upsert_evaluation(
    session_id: str,
    child_id: str,
    body: UpsertEvaluationRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")

    existing = db.query(SessionEvaluation).filter(
        SessionEvaluation.session_id == session_id,
        SessionEvaluation.child_id == child_id,
    ).first()

    if existing:
        existing.score = body.score
        existing.comment = body.comment
        existing.teacher_id = current_user.id
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return {"evaluation": _serialize_evaluation(existing, child.name)}
    else:
        ev = SessionEvaluation(
            session_id=session_id,
            child_id=child_id,
            teacher_id=current_user.id,
            score=body.score,
            comment=body.comment,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return {"evaluation": _serialize_evaluation(ev, child.name)}


# ─── Report ─────────────────────────────────────────────────────────

@router.get("/{session_id}/report")
def get_session_report(
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

    class_name = None
    if session.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == session.class_id).first()
        class_name = cls.name if cls else None

    imu_count = db.query(func.count(IMUData.id)).filter(
        IMUData.session_id == session_id
    ).scalar() or 0
    device_count = db.query(func.count(func.distinct(IMUData.device_id))).filter(
        IMUData.session_id == session_id
    ).scalar() or 0

    assessments = (
        db.query(AssessmentResult)
        .filter(AssessmentResult.session_id == session_id)
        .all()
    )
    avg_activity = None
    avg_smoothness = None
    avg_stability = None
    if assessments:
        avg_activity = sum(a.activity_level or 0 for a in assessments) / len(assessments)
        avg_smoothness = sum(a.smoothness or 0 for a in assessments) / len(assessments)
        avg_stability = sum(a.stability_index or 0 for a in assessments) / len(assessments)

    evaluations = db.query(SessionEvaluation).filter(
        SessionEvaluation.session_id == session_id
    ).all()
    evaluations_data = []
    for ev in evaluations:
        child = db.query(Child).filter(Child.id == ev.child_id).first()
        evaluations_data.append(_serialize_evaluation(ev, child.name if child else None))

    return {
        "session": {
            "id": session.id,
            "name": session.name,
            "description": session.description,
            "status": session.status,
            "class_name": class_name,
            "scheduled_at": session.scheduled_at.isoformat() if session.scheduled_at else None,
            "started_at": session.start_time.isoformat() if session.start_time else None,
            "ended_at": session.end_time.isoformat() if session.end_time else None,
        },
        "summary": {
            "imu_count": imu_count,
            "device_count": device_count,
        },
        "assessments": {
            "avg_activity_level": round(avg_activity, 4) if avg_activity else None,
            "avg_smoothness": round(avg_smoothness, 4) if avg_smoothness else None,
            "avg_stability_index": round(avg_stability, 4) if avg_stability else None,
        },
        "evaluations": evaluations_data,
    }
