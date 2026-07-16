from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.auth.deps import require_login
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.report import Report
from app.models.session import Session as SessionModel
from app.models.user import User

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{report_id}")
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")

    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == report.session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Report not found in your organization")

    return {
        "id": report.id,
        "session_id": report.session_id,
        "report_type": "educational",
        "status": report.status,
        "generated_at": report.generated_at.isoformat() if report.generated_at else None,
        "markdown": report.markdown or (report.content or {}).get("markdown", ""),
        "pdf_path": report.pdf_path,
    }
