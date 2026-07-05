from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc

from app.auth.deps import get_current_user, require_role
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.session_template import SessionTemplate
from app.models.user import User

router = APIRouter(prefix="/api/templates", tags=["templates"])


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    duration_minutes: int | None = None
    stages: list | None = None
    metrics_config: dict | None = None


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    stages: list | None = None
    metrics_config: dict | None = None


def _serialize_template(t: SessionTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "duration_minutes": t.duration_minutes,
        "stages": t.stages,
        "metrics_config": t.metrics_config,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_templates(
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    templates = (
        db.query(SessionTemplate)
        .filter(SessionTemplate.org_id == org_id)
        .order_by(desc(SessionTemplate.created_at))
        .all()
    )
    return {"templates": [_serialize_template(t) for t in templates]}


@router.post("")
def create_template(
    body: CreateTemplateRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = SessionTemplate(
        org_id=org_id,
        name=body.name,
        description=body.description,
        duration_minutes=body.duration_minutes,
        stages=body.stages,
        metrics_config=body.metrics_config,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {"template": _serialize_template(tpl)}


@router.get("/{template_id}")
def get_template(
    template_id: str,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(SessionTemplate).filter(
        SessionTemplate.id == template_id,
        SessionTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    return {"template": _serialize_template(tpl)}


@router.put("/{template_id}")
def update_template(
    template_id: str,
    body: UpdateTemplateRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(SessionTemplate).filter(
        SessionTemplate.id == template_id,
        SessionTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    if body.name is not None:
        tpl.name = body.name
    if body.description is not None:
        tpl.description = body.description
    if body.duration_minutes is not None:
        tpl.duration_minutes = body.duration_minutes
    if body.stages is not None:
        tpl.stages = body.stages
    if body.metrics_config is not None:
        tpl.metrics_config = body.metrics_config
    db.commit()
    db.refresh(tpl)
    return {"template": _serialize_template(tpl)}


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    org_id = effective_org_id(current_user)
    tpl = db.query(SessionTemplate).filter(
        SessionTemplate.id == template_id,
        SessionTemplate.org_id == org_id,
    ).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    db.delete(tpl)
    db.commit()
    return {"status": "deleted"}
