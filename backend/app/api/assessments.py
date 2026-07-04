from math import sqrt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func

from app.auth.deps import get_current_user
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.session import Session as SessionModel
from app.models.course_template import CourseTemplate
from app.models.analysis_result import AnalysisResult
from app.models.assessment_result import AssessmentResult
from app.models.imu_data import IMUData
from app.models.device_assignment import DeviceAssignment
from app.models.device import Device
from app.models.child import Child
from app.models.course_template import CourseTemplate
from app.models.user import User
from datetime import datetime
from uuid import uuid4

router = APIRouter(prefix="/api", tags=["assessments"])


def _compute_metrics(accel_x: list[float], accel_y: list[float], accel_z: list[float]) -> dict | None:
    if len(accel_x) < 10:
        return None
    mags = [sqrt(x * x + y * y + z * z) for x, y, z in zip(accel_x, accel_y, accel_z)]
    n = len(mags)
    sum_sq = sum(m * m for m in mags)
    rms = sqrt(sum_sq / n)
    mean = sum(mags) / n
    variance = sum((m - mean) ** 2 for m in mags) / n
    std = sqrt(variance)
    cv = std / mean if mean > 0.01 else 0
    stability = max(0.0, min(1.0, 1.0 - cv))
    return {
        "activity_level": round(rms, 4),
        "smoothness": round(cv, 4),
        "stability_index": round(stability, 4),
    }


@router.post("/sessions/{session_id}/assessments/compute")
def compute_session_assessment(
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

    device_ids = [
        row[0] for row in db.query(func.distinct(IMUData.device_id))
        .filter(IMUData.session_id == session_id)
        .all()
        if row[0]
    ]
    if not device_ids:
        raise HTTPException(400, "No IMU data for this session")

    assignments = {
        a.device_id: a.child_id
        for a in db.query(DeviceAssignment)
        .filter(
            DeviceAssignment.session_id == session_id,
            DeviceAssignment.device_id.in_(device_ids),
        )
        .all()
    }

    devices_map = {
        d.device_id: d.id
        for d in db.query(Device).filter(Device.device_id.in_(device_ids)).all()
    }
    raw_by_uuid = {v: k for k, v in devices_map.items()}

    results = []
    for raw_device_id in device_ids:
        rows = (
            db.query(IMUData.accel_x, IMUData.accel_y, IMUData.accel_z)
            .filter(
                IMUData.session_id == session_id,
                IMUData.device_id == raw_device_id,
            )
            .order_by(IMUData.id)
            .all()
        )
        if not rows:
            continue
        ax = [r[0] for r in rows]
        ay = [r[1] for r in rows]
        az = [r[2] for r in rows]
        metrics = _compute_metrics(ax, ay, az)
        if metrics is None:
            continue

        device_uuid = devices_map.get(raw_device_id)
        child_id = assignments.get(raw_device_id)

        ts = rows[0][0] if rows else 0
        ts_last = rows[-1][0] if rows else 0
        window_sec = abs(ts_last - ts) if hasattr(rows[-1], "__getitem__") else 0

        existing = db.query(AssessmentResult).filter(
            AssessmentResult.session_id == session_id,
            AssessmentResult.device_id == device_uuid,
            AssessmentResult.child_id == child_id,
        ).first()

        if existing:
            existing.activity_level = metrics["activity_level"]
            existing.smoothness = metrics["smoothness"]
            existing.stability_index = metrics["stability_index"]
            existing.sample_count = len(rows)
            existing.window_seconds = window_sec
            existing.computed_at = datetime.utcnow()
            result = existing
        else:
            result = AssessmentResult(
                id=str(uuid4()),
                session_id=session_id,
                device_id=device_uuid,
                child_id=child_id,
                activity_level=metrics["activity_level"],
                smoothness=metrics["smoothness"],
                stability_index=metrics["stability_index"],
                sample_count=len(rows),
                window_seconds=window_sec,
            )
            db.add(result)
        results.append(result)

    db.commit()
    for r in results:
        db.refresh(r)

    # ── populate AnalysisResult based on template music element ──
    tmpl = db.query(CourseTemplate).filter(
        CourseTemplate.id == session.template_id
    ).first() if session.template_id else None
    music_element = ""
    if tmpl and tmpl.stages:
        stages_data = tmpl.stages
        if isinstance(stages_data, list) and len(stages_data) > 0:
            music_element = (stages_data[0].get("music_element") or "")

    analysis_entries = []
    for r in results:
        if not r.child_id:
            continue
        rhythm_sync = None
        freeze_time = None
        freeze_stability = None

        # Re-fetch IMU data for this device in sliding windows
        raw_id = raw_by_uuid.get(r.device_id) if r.device_id else None
        if not raw_id:
            continue
        imu_rows = (
            db.query(IMUData.accel_x, IMUData.accel_y, IMUData.accel_z)
            .filter(
                IMUData.session_id == session_id,
                IMUData.device_id == raw_id,
            )
            .order_by(IMUData.id)
            .all()
        )
        mags = [sqrt(x*x + y*y + z*z) for x, y, z in imu_rows]

        if "節奏" in music_element or "拍子" in music_element:
            # Rough rhythm sync: zero-crossing rate of detrended magnitude
            if len(mags) > 50:
                mean_mag = sum(mags) / len(mags)
                detrended = [m - mean_mag for m in mags]
                crossings = sum(
                    1 for i in range(1, len(detrended))
                    if (detrended[i-1] > 0) != (detrended[i] > 0)
                )
                rhythm_sync = round(min(1.0, crossings / (len(detrended) * 0.5)), 4)

        if "走停" in music_element:
            # Rough freeze detection: look for sudden drops below a threshold
            if len(mags) > 100:
                window = 20
                ratios = []
                for i in range(window, len(mags)):
                    pre = sum(mags[i-window:i]) / window
                    post = sum(mags[i:min(i+window, len(mags))]) / window
                    if pre > 0.5:
                        ratios.append(post / pre)
                if ratios:
                    min_ratio = min(ratios)
                    freeze_time = round(float(min_ratio), 4) if min_ratio < 0.5 else None
                    # stability during quiet periods
                    quiet = [m for m in mags if m < 1.0]
                    if quiet:
                        cv = (sum((m - (sum(quiet)/len(quiet)))**2 for m in quiet) / len(quiet))**0.5 / (sum(quiet)/len(quiet))
                        freeze_stability = round(max(0.0, min(1.0, 1.0 - cv)), 4)

        existing_analysis = db.query(AnalysisResult).filter(
            AnalysisResult.session_id == session_id,
            AnalysisResult.child_id == r.child_id,
        ).first()

        if existing_analysis:
            if rhythm_sync is not None:
                existing_analysis.rhythm_sync_rate = rhythm_sync
            if freeze_time is not None:
                existing_analysis.freeze_reaction_time = freeze_time
            if freeze_stability is not None:
                existing_analysis.freeze_stability_score = freeze_stability
            existing_analysis.timestamp = datetime.utcnow()
        else:
            analysis_entries.append(AnalysisResult(
                id=str(uuid4()),
                session_id=session_id,
                child_id=r.child_id,
                rhythm_sync_rate=rhythm_sync,
                freeze_reaction_time=freeze_time,
                freeze_stability_score=freeze_stability,
                timestamp=datetime.utcnow(),
            ))

    for a in analysis_entries:
        db.add(a)
    if analysis_entries:
        db.commit()

    return {
        "assessments": [
            {
                "id": r.id,
                "device_id": r.device_id,
                "child_id": r.child_id,
                "activity_level": r.activity_level,
                "smoothness": r.smoothness,
                "stability_index": r.stability_index,
                "sample_count": r.sample_count,
                "window_seconds": r.window_seconds,
                "computed_at": r.computed_at.isoformat() if r.computed_at else None,
            }
            for r in results
        ]
    }


@router.get("/sessions/{session_id}/assessments")
def get_session_assessments(
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
        db.query(AssessmentResult)
        .filter(AssessmentResult.session_id == session_id)
        .all()
    )

    child_ids = list({r.child_id for r in results if r.child_id})
    children_map = {
        c.id: c
        for c in db.query(Child).filter(Child.id.in_(child_ids)).all()
    } if child_ids else {}

    device_uuids = list({r.device_id for r in results if r.device_id})
    device_map = {
        d.id: d
        for d in db.query(Device).filter(Device.id.in_(device_uuids)).all()
    } if device_uuids else {}

    assessments = []
    for r in results:
        child = children_map.get(r.child_id) if r.child_id else None
        dev = device_map.get(r.device_id) if r.device_id else None
        assessments.append({
            "id": r.id,
            "device_id": r.device_id,
            "device_name": dev.device_id if dev else None,
            "child_id": r.child_id,
            "child_name": child.name if child else None,
            "activity_level": r.activity_level,
            "smoothness": r.smoothness,
            "stability_index": r.stability_index,
            "sample_count": r.sample_count,
            "window_seconds": r.window_seconds,
            "computed_at": r.computed_at.isoformat() if r.computed_at else None,
        })

    n = len(assessments) or 1
    avg_activity = sum(a["activity_level"] or 0 for a in assessments) / n
    avg_smoothness = sum(a["smoothness"] or 0 for a in assessments) / n
    avg_stability = sum(a["stability_index"] or 0 for a in assessments) / n

    return {
        "session_id": session_id,
        "assessments": assessments,
        "summary": {
            "student_count": sum(1 for a in assessments if a["child_id"]),
            "device_count": len(assessments),
            "avg_activity_level": round(avg_activity, 4),
            "avg_smoothness": round(avg_smoothness, 4),
            "avg_stability_index": round(avg_stability, 4),
        },
    }


@router.get("/children/{child_id}/assessments")
def get_child_assessments(
    child_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    child = db.query(Child).filter(
        Child.id == child_id,
        Child.org_id == org_id,
    ).first()
    if not child:
        raise HTTPException(404, "Child not found")

    results = (
        db.query(AssessmentResult, SessionModel)
        .join(SessionModel, SessionModel.id == AssessmentResult.session_id)
        .filter(
            AssessmentResult.child_id == child_id,
            SessionModel.org_id == org_id,
        )
        .order_by(SessionModel.start_time.desc())
        .all()
    )

    # Resolve template info per session
    template_cache: dict[str, tuple[str | None, str | None]] = {}
    def _template_info(session) -> tuple[str | None, str | None]:
        tid = session.template_id
        if not tid:
            return (None, None)
        if tid not in template_cache:
            tmpl = db.query(CourseTemplate).filter(CourseTemplate.id == tid).first()
            if tmpl and tmpl.stages:
                stages_data = tmpl.stages
                if isinstance(stages_data, list) and len(stages_data) > 0:
                    me = stages_data[0].get("music_element") or None
                    template_cache[tid] = (tmpl.name, me)
                else:
                    template_cache[tid] = (tmpl.name, None)
            else:
                template_cache[tid] = (None, None)
        return template_cache[tid]

    return {
        "child_id": child_id,
        "child_name": child.name,
        "assessments": [
            {
                "id": r.id,
                "session_id": r.session_id,
                "device_id": r.device_id,
                "child_id": r.child_id,
                "course_type": s.course_type,
                "session_started_at": s.start_time.isoformat() if s.start_time else None,
                "activity_level": r.activity_level,
                "smoothness": r.smoothness,
                "stability_index": r.stability_index,
                "sample_count": r.sample_count,
                "computed_at": r.computed_at.isoformat() if r.computed_at else None,
                "template_name": _template_info(s)[0],
                "music_element": _template_info(s)[1],
            }
            for r, s in results
        ],
    }


@router.get("/classes/{class_id}/assessments")
def get_class_assessments(
    class_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    class_obj = db.query(SessionModel).filter(
        SessionModel.id == class_id,
    ).first()

    sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.class_id == class_id,
            SessionModel.org_id == org_id,
        )
        .order_by(SessionModel.start_time.desc())
        .all()
    )

    all_sessions_data = []
    for session in sessions:
        results = (
            db.query(AssessmentResult)
            .filter(AssessmentResult.session_id == session.id)
            .all()
        )
        if not results:
            continue
        all_sessions_data.append({
            "session_id": session.id,
            "course_type": session.course_type,
            "started_at": session.start_time.isoformat() if session.start_time else None,
            "student_count": sum(1 for r in results if r.child_id),
            "device_count": len(results),
            "avg_activity_level": round(
                sum(r.activity_level or 0 for r in results) / len(results), 4
            ),
            "avg_smoothness": round(
                sum(r.smoothness or 0 for r in results) / len(results), 4
            ),
            "avg_stability_index": round(
                sum(r.stability_index or 0 for r in results) / len(results), 4
            ),
        })

    return {
        "class_id": class_id,
        "sessions": all_sessions_data,
        "total_sessions_with_assessments": len(all_sessions_data),
    }


@router.get("/children/{child_id}/analysis/trends")
def get_child_analysis_trends(
    child_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    child = db.query(Child).filter(
        Child.id == child_id,
        Child.org_id == org_id,
    ).first()
    if not child:
        raise HTTPException(404, "Child not found")

    rows = (
        db.query(AnalysisResult, SessionModel, CourseTemplate)
        .join(SessionModel, SessionModel.id == AnalysisResult.session_id)
        .outerjoin(CourseTemplate, CourseTemplate.id == SessionModel.template_id)
        .filter(
            AnalysisResult.child_id == child_id,
            SessionModel.org_id == org_id,
        )
        .order_by(SessionModel.start_time.asc())
        .all()
    )

    # Extract music_element from template stages
    trends: dict[str, list[dict]] = {}
    for ar, s, tmpl in rows:
        music = "一般"
        if tmpl and tmpl.stages:
            stages_data = tmpl.stages
            if isinstance(stages_data, list) and len(stages_data) > 0:
                music = stages_data[0].get("music_element") or "一般"
        if music not in trends:
            trends[music] = []
        entry = {
            "session_id": s.id,
            "date": s.start_time.isoformat() if s.start_time else None,
            "rhythm_sync_rate": ar.rhythm_sync_rate,
            "freeze_reaction_time": ar.freeze_reaction_time,
            "freeze_stability_score": ar.freeze_stability_score,
        }
        trends[music].append(entry)

    return {
        "child_id": child_id,
        "child_name": child.name,
        "trends": trends,
    }
