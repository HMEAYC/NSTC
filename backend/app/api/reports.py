from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.models.report import Report

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
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
