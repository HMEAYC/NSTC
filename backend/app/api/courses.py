from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc, func

from app.auth.deps import get_current_user, require_role, same_org
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.course import Course
from app.models.course_template import CourseTemplate
from app.models.course_evaluation import CourseEvaluation
from app.models.session import Session
from app.models.school_class import SchoolClass
from app.models.user import User
from app.models.child import Child
from app.models.assessment_result import AssessmentResult
from app.models.imu_data import IMUData

router = APIRouter(tags=["courses"])


# ─── Pydantic Schemas ──────────────────────────────────────────────

class CourseTemplateOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    duration_minutes: int | None = None
    stages: list | None = None
    metrics_config: dict | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}


class CourseOut(BaseModel):
    id: str
    org_id: str
    class_id: str | None = None
    template_id: str | None = None
    name: str
    description: str | None = None
    status: str
    scheduled_at: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}


class CourseDetailOut(CourseOut):
    class_name: str | None = None
    template_name: str | None = None
    sessions: list[dict] = []


class SessionRefOut(BaseModel):
    id: str
    title: str | None = None
    course_type: str
    status: str
    start_time: str | None = None
    end_time: str | None = None

    model_config = {"from_attributes": True}


# ─── Helpers ───────────────────────────────────────────────────────

def _serialize_course(c: Course) -> dict:
    return {
        "id": c.id,
        "org_id": c.org_id,
        "class_id": c.class_id,
        "template_id": c.template_id,
        "name": c.name,
        "description": c.description,
        "status": c.status,
        "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_session(s: Session) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "course_type": s.course_type,
        "status": s.status,
        "start_time": s.start_time.isoformat() if s.start_time else None,
        "end_time": s.end_time.isoformat() if s.end_time else None,
    }


def _serialize_template(t: CourseTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "duration_minutes": t.duration_minutes,
        "stages": t.stages,
        "metrics_config": t.metrics_config,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ─── Course Templates ──────────────────────────────────────────────

@router.get("/api/templates")
def list_templates(
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    templates = (
        db.query(CourseTemplate)
        .filter(CourseTemplate.org_id == org_id)
        .order_by(desc(CourseTemplate.created_at))
        .all()
    )
    return {"templates": [_serialize_template(t) for t in templates]}


@router.post("/api/templates")
def create_template(
    name: str,
    description: str | None = None,
    duration_minutes: int | None = None,
    stages: list | None = None,
    metrics_config: dict | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = CourseTemplate(
        org_id=org_id,
        name=name,
        description=description,
        duration_minutes=duration_minutes,
        stages=stages,
        metrics_config=metrics_config,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {"template": _serialize_template(tpl)}


@router.get("/api/templates/{template_id}")
def get_template(
    template_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(CourseTemplate).filter(
        CourseTemplate.id == template_id,
        CourseTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    return {"template": _serialize_template(tpl)}


@router.put("/api/templates/{template_id}")
def update_template(
    template_id: str,
    name: str | None = None,
    description: str | None = None,
    duration_minutes: int | None = None,
    stages: list | None = None,
    metrics_config: dict | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(CourseTemplate).filter(
        CourseTemplate.id == template_id,
        CourseTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    if name is not None:
        tpl.name = name
    if description is not None:
        tpl.description = description
    if duration_minutes is not None:
        tpl.duration_minutes = duration_minutes
    if stages is not None:
        tpl.stages = stages
    if metrics_config is not None:
        tpl.metrics_config = metrics_config
    db.commit()
    db.refresh(tpl)
    return {"template": _serialize_template(tpl)}


@router.delete("/api/templates/{template_id}")
def delete_template(
    template_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(CourseTemplate).filter(
        CourseTemplate.id == template_id,
        CourseTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    db.delete(tpl)
    db.commit()
    return {"status": "deleted"}


# ─── Courses ───────────────────────────────────────────────────────

@router.get("/api/courses")
def list_courses(
    status: str | None = None,
    class_id: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    query = db.query(Course).filter(Course.org_id == org_id)
    if status:
        query = query.filter(Course.status == status)
    if class_id:
        query = query.filter(Course.class_id == class_id)
    courses = query.order_by(desc(Course.created_at)).all()
    return {"courses": [_serialize_course(c) for c in courses]}


@router.post("/api/courses")
def create_course(
    name: str,
    class_id: str | None = None,
    template_id: str | None = None,
    description: str | None = None,
    scheduled_at: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    parsed_scheduled = None
    if scheduled_at:
        parsed_scheduled = datetime.fromisoformat(scheduled_at)

    course = Course(
        org_id=org_id,
        class_id=class_id,
        template_id=template_id,
        name=name,
        description=description,
        scheduled_at=parsed_scheduled,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return {"course": _serialize_course(course)}


@router.get("/api/courses/{course_id}")
def get_course(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    result = _serialize_course(course)

    if course.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == course.class_id).first()
        result["class_name"] = cls.name if cls else None
    else:
        result["class_name"] = None

    if course.template_id:
        tpl = db.query(CourseTemplate).filter(CourseTemplate.id == course.template_id).first()
        result["template_name"] = tpl.name if tpl else None
    else:
        result["template_name"] = None

    sessions = (
        db.query(Session)
        .filter(Session.course_id == course_id)
        .order_by(Session.start_time)
        .all()
    )
    result["sessions"] = [_serialize_session(s) for s in sessions]

    return {"course": result}


@router.put("/api/courses/{course_id}")
def update_course(
    course_id: str,
    name: str | None = None,
    description: str | None = None,
    class_id: str | None = None,
    template_id: str | None = None,
    scheduled_at: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.status not in ("draft", "scheduled"):
        raise HTTPException(400, "Only draft or scheduled courses can be edited")

    if name is not None:
        course.name = name
    if description is not None:
        course.description = description
    if class_id is not None:
        course.class_id = class_id
    if template_id is not None:
        course.template_id = template_id
    if scheduled_at is not None:
        course.scheduled_at = datetime.fromisoformat(scheduled_at) if scheduled_at else None

    db.commit()
    db.refresh(course)
    return {"course": _serialize_course(course)}


@router.delete("/api/courses/{course_id}")
def delete_course(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.status not in ("draft", "cancelled"):
        raise HTTPException(400, "Only draft or cancelled courses can be deleted")

    # Unlink sessions before deleting
    for s in db.query(Session).filter(Session.course_id == course_id).all():
        s.course_id = None
    db.delete(course)
    db.commit()
    return {"status": "deleted"}


@router.post("/api/courses/{course_id}/start")
def start_course(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.status not in ("draft", "scheduled"):
        raise HTTPException(400, f"Cannot start course with status '{course.status}'")

    course.status = "active"
    course.started_at = datetime.utcnow()
    db.commit()
    db.refresh(course)
    return {"course": _serialize_course(course)}


@router.post("/api/courses/{course_id}/end")
def end_course(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.status != "active":
        raise HTTPException(400, "Only active courses can be ended")

    course.status = "completed"
    course.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(course)
    return {"course": _serialize_course(course)}


@router.get("/api/courses/{course_id}/sessions")
def list_course_sessions(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    sessions = (
        db.query(Session)
        .filter(Session.course_id == course_id)
        .order_by(Session.start_time)
        .all()
    )
    return {"sessions": [_serialize_session(s) for s in sessions]}


# ─── Course Evaluations ────────────────────────────────────────────

@router.get("/api/courses/{course_id}/evaluations")
def list_course_evaluations(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    evaluations = (
        db.query(CourseEvaluation)
        .filter(CourseEvaluation.course_id == course_id)
        .all()
    )
    eval_map = {e.child_id: e for e in evaluations}

    child_ids = [e.child_id for e in evaluations]
    course_session_ids = [
        s.id for s in db.query(Session.id).filter(Session.course_id == course_id).all()
    ]

    # Get class children if no evaluations yet
    if not child_ids and course.class_id:
        class_children = (
            db.query(Child)
            .filter(Child.class_id == course.class_id)
            .all()
        )
        child_list = class_children
    else:
        child_list = db.query(Child).filter(Child.id.in_(child_ids)).all() if child_ids else []

    result = []
    for child in child_list:
        ev = eval_map.get(child.id)
        result.append({
            "child_id": child.id,
            "child_name": child.name,
            "score": ev.score if ev else None,
            "comment": ev.comment if ev else None,
            "teacher_id": ev.teacher_id if ev else None,
        })
    return {"evaluations": result}


@router.put("/api/courses/{course_id}/evaluations/{child_id}")
def upsert_course_evaluation(
    course_id: str,
    child_id: str,
    score: float | None = None,
    comment: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")

    existing = db.query(CourseEvaluation).filter(
        CourseEvaluation.course_id == course_id,
        CourseEvaluation.child_id == child_id,
    ).first()

    if existing:
        existing.score = score
        existing.comment = comment
        existing.teacher_id = current_user.id
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return {"evaluation": {"child_id": existing.child_id, "score": existing.score, "comment": existing.comment}}
    else:
        ev = CourseEvaluation(
            course_id=course_id,
            child_id=child_id,
            teacher_id=current_user.id,
            score=score,
            comment=comment,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return {"evaluation": {"child_id": ev.child_id, "score": ev.score, "comment": ev.comment}}


# ─── Course Report ─────────────────────────────────────────────────

@router.get("/api/courses/{course_id}/report")
def get_course_report(
    course_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.org_id == org_id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    sessions = (
        db.query(Session)
        .filter(Session.course_id == course_id)
        .order_by(Session.start_time)
        .all()
    )

    class_name = None
    if course.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == course.class_id).first()
        class_name = cls.name if cls else None

    session_data = []
    total_imu = 0
    total_devices = set()

    for s in sessions:
        imu_count = db.query(func.count(IMUData.id)).filter(IMUData.session_id == s.id).scalar() or 0
        device_count = db.query(func.count(func.distinct(IMUData.device_id))).filter(IMUData.session_id == s.id).scalar() or 0
        total_imu += imu_count
        if device_count:
            total_devices.add(s.id)

        assessments = (
            db.query(AssessmentResult)
            .filter(AssessmentResult.session_id == s.id)
            .all()
        )

        avg_activity = None
        avg_smoothness = None
        avg_stability = None
        if assessments:
            avg_activity = sum(a.activity_level or 0 for a in assessments) / len(assessments)
            avg_smoothness = sum(a.smoothness or 0 for a in assessments) / len(assessments)
            avg_stability = sum(a.stability_index or 0 for a in assessments) / len(assessments)

        session_data.append({
            "session_id": s.id,
            "title": s.title,
            "status": s.status,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "imu_count": imu_count,
            "device_count": device_count,
            "avg_activity_level": round(avg_activity, 4) if avg_activity else None,
            "avg_smoothness": round(avg_smoothness, 4) if avg_smoothness else None,
            "avg_stability_index": round(avg_stability, 4) if avg_stability else None,
        })

    # Evaluations summary
    evaluations = db.query(CourseEvaluation).filter(CourseEvaluation.course_id == course_id).all()
    evaluations_data = []
    for ev in evaluations:
        child = db.query(Child).filter(Child.id == ev.child_id).first()
        evaluations_data.append({
            "child_id": ev.child_id,
            "child_name": child.name if child else "Unknown",
            "score": ev.score,
            "comment": ev.comment,
        })

    return {
        "course": {
            "id": course.id,
            "name": course.name,
            "description": course.description,
            "status": course.status,
            "class_name": class_name,
            "scheduled_at": course.scheduled_at.isoformat() if course.scheduled_at else None,
            "started_at": course.started_at.isoformat() if course.started_at else None,
            "ended_at": course.ended_at.isoformat() if course.ended_at else None,
        },
        "summary": {
            "session_count": len(sessions),
            "total_imu_records": total_imu,
            "unique_devices": len(total_devices),
        },
        "sessions": session_data,
        "evaluations": evaluations_data,
    }
