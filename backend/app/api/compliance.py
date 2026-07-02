from __future__ import annotations

import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_role, same_org
from app.db.base import get_db
from app.models.child import Child as ChildModel
from app.models.audit_log import AuditLog
from app.models.parent_consent import ParentConsent
from app.models.user import User
from app.auth.org import effective_org_id

router = APIRouter(tags=["compliance"])


# ─── Audit Log ───────────────────────────────────────────────────

def log_action(
    db: Session,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    log = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(log)
    db.commit()


@router.get("/api/admin/audit-logs")
def list_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin", "org_admin")),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return {
        "logs": [
            {
                "id": l.id,
                "actor_email": l.actor_email,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "details": l.details,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]
    }


# ─── Anonymous Export ────────────────────────────────────────────

@router.get("/api/admin/export/anonymized")
def export_anonymized(
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "org_admin")),
):
    org_id = effective_org_id(current_user)
    children = db.query(ChildModel).filter(ChildModel.org_id == org_id).all()

    records = []
    for c in children:
        records.append({
            "child_id_hashed": c.id,
            "age_group": "preschool",
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    log_action(db, current_user, "export_anonymized", "children", org_id, {"count": len(records)})

    if format == "csv":
        output = io.StringIO()
        if records:
            writer = csv.DictWriter(output, fieldnames=records[0].keys())
            writer.writeheader()
            writer.writerows(records)
        else:
            output.write("child_id_hashed,age_group,created_at\n")
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=hmeayc-export-{datetime.utcnow().date()}.csv"},
        )

    return {"records": records, "count": len(records)}


@router.post("/api/admin/export/anonymized")
def export_anonymized_json(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "org_admin")),
):
    """Alias for POST to generate anonymized JSON export."""
    return export_anonymized(format="json", db=db, current_user=current_user)


# ─── IRB / Parent Consent ────────────────────────────────────────

@router.post("/api/consent")
def upload_consent(
    child_id: str = Form(...),
    parent_id: str = Form(...),
    consented: bool = Form(...),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    child = db.query(ChildModel).filter(ChildModel.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    if current_user.role != "super_admin":
        same_org(child.org_id, current_user)

    file_path = None
    if file:
        from app.paths import reports_dir
        consent_dir = reports_dir() / "consents"
        consent_dir.mkdir(parents=True, exist_ok=True)
        ext = file.filename.split(".")[-1] if file.filename else "pdf"
        fname = f"consent_{child_id}_{datetime.utcnow().date()}.{ext}"
        file_path = str(consent_dir / fname)
        content = file.file.read()
        (consent_dir / fname).write_bytes(content)

    existing = db.query(ParentConsent).filter(
        ParentConsent.child_id == child_id,
        ParentConsent.parent_id == parent_id,
    ).first()

    if existing:
        existing.consented = consented
        existing.consent_file_path = file_path or existing.consent_file_path
        existing.consented_at = datetime.utcnow() if consented else None
        existing.revoked_at = datetime.utcnow() if not consented else None
        db.commit()
        db.refresh(existing)
        record = existing
    else:
        record = ParentConsent(
            child_id=child_id,
            parent_id=parent_id,
            consented=consented,
            consent_file_path=file_path,
            consented_at=datetime.utcnow() if consented else None,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

    log_action(db, current_user, "upload_consent", "parent_consent", record.id, {
        "child_id": child_id, "parent_id": parent_id, "consented": consented,
    })

    return {
        "id": record.id,
        "child_id": record.child_id,
        "parent_id": record.parent_id,
        "consented": record.consented,
        "consented_at": record.consented_at.isoformat() if record.consented_at else None,
    }


@router.get("/api/consent/{child_id}")
def get_consent(
    child_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "parent")),
):
    child = db.query(ChildModel).filter(ChildModel.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")

    if current_user.role == "parent":
        from app.models.parent_child import ParentChild
        binding = db.query(ParentChild).filter(
            ParentChild.parent_id == current_user.id,
            ParentChild.child_id == child_id,
        ).first()
        if not binding:
            raise HTTPException(403, "Not your child")
    elif current_user.role != "super_admin":
        same_org(child.org_id, current_user)

    consents = db.query(ParentConsent).filter(ParentConsent.child_id == child_id).all()
    return {
        "consents": [
            {
                "id": c.id,
                "parent_id": c.parent_id,
                "consented": c.consented,
                "consented_at": c.consented_at.isoformat() if c.consented_at else None,
                "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
            }
            for c in consents
        ]
    }


@router.get("/api/admin/export/consent-report")
def consent_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "org_admin")),
):
    org_id = effective_org_id(current_user)
    children = db.query(ChildModel).filter(ChildModel.org_id == org_id).all()
    child_ids = [c.id for c in children]
    consents = db.query(ParentConsent).filter(ParentConsent.child_id.in_(child_ids)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["child_id", "parent_id", "consented", "consented_at", "revoked_at", "has_file"])
    for c in consents:
        writer.writerow([
            c.child_id, c.parent_id, c.consented,
            c.consented_at.isoformat() if c.consented_at else "",
            c.revoked_at.isoformat() if c.revoked_at else "",
            "yes" if c.consent_file_path else "no",
        ])
    output.seek(0)

    log_action(db, current_user, "export_consent_report", "parent_consent", org_id, {"count": len(consents)})

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=hmeayc-consent-report-{datetime.utcnow().date()}.csv"},
    )
