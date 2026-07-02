from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc, func

from app.auth import require_api_key
from app.auth.deps import get_current_user, require_role
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.session import Session as SessionModel
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
        })
    return {"sessions": result}


@router.post("")
def create_session(
    course_type: str = "march",
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = SessionModel(
        course_type=course_type,
        org_id=org_id,
        teacher_id=current_user.id if current_user else None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "course_type": session.course_type,
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

    return {
        "id": session.id,
        "course_type": session.course_type,
        "status": session.status,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "imu_count": imu_count,
        "device_count": device_count,
    }


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


@router.post("/{session_id}/report")
def generate_report(
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

    duration = None
    if session.start_time and session.end_time:
        duration = (session.end_time - session.start_time).total_seconds()
    elif session.start_time:
        duration = (datetime.utcnow() - session.start_time).total_seconds()

    imu_avg = db.query(
        func.avg(IMUData.accel_x),
        func.avg(IMUData.accel_y),
        func.avg(IMUData.accel_z),
    ).filter(IMUData.session_id == session_id).first()

    ax_str = f"{imu_avg[0]:.4f} g" if imu_avg[0] else "N/A"
    ay_str = f"{imu_avg[1]:.4f} g" if imu_avg[1] else "N/A"
    az_str = f"{imu_avg[2]:.4f} g" if imu_avg[2] else "N/A"
    dur_str = f"{duration:.0f} 秒 ({duration/60:.1f} 分)" if duration else "N/A"

    markdown = f"""# 課程分析報告

## 課程資訊

| 項目 | 內容 |
|------|------|
| **課程 ID** | {session_id[:8]}... |
| **課程類型** | {session.course_type} |
| **狀態** | {session.status} |
| **開始時間** | {session.start_time.strftime('%Y-%m-%d %H:%M:%S') if session.start_time else 'N/A'} |
| **結束時間** | {session.end_time.strftime('%Y-%m-%d %H:%M:%S') if session.end_time else '進行中'} |
| **持續時間** | {dur_str} |

## 感測器資料摘要

| 項目 | 數值 |
|------|------|
| **IMU 資料筆數** | {imu_count} |
| **使用裝置數** | {device_count} |
| **平均 Accel X** | {ax_str} |
| **平均 Accel Y** | {ay_str} |
| **平均 Accel Z** | {az_str} |

## 分析結果

> 目前無即時分析結果。請透過「評估指標」頁面查看即時 IMU 運算指標。
> 完整節奏分析與 Freeze Dance 分析需啟用後端分析管線後自動產生。

## 教育建議

- 本課程類型為 **{session.course_type}**，適合幼兒進行節奏與動作協調訓練。
- 建議教師觀察幼兒的活動量與穩定性指標，適時調整課程強度。
- 多次課程後可對比長期趨勢，評估幼兒動作發展進度。
"""
    existing = db.query(Report).filter(Report.session_id == session_id).first()
    if existing:
        existing.markdown = markdown
        existing.content = {"markdown": markdown}
        existing.status = "done"
        if current_user:
            existing.generated_by = current_user.id
        db.commit()
        db.refresh(existing)
        return {"report": {"id": existing.id}}

    report = Report(
        session_id=session_id,
        markdown=markdown,
        content={"markdown": markdown},
        status="done",
        generated_by=current_user.id if current_user else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"report": {"id": report.id}}


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

    report = (
        db.query(Report).filter(Report.session_id == session_id).first()
    )
    if not report:
        raise HTTPException(404, "Report not found")
    return {
        "id": report.id,
        "session_id": report.session_id,
        "report_type": "educational",
        "status": report.status,
        "generated_at": report.generated_at.isoformat() if report.generated_at else None,
        "markdown": report.markdown or (report.content or {}).get("markdown", ""),
        "pdf_path": report.pdf_path,
    }
