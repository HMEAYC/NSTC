from __future__ import annotations

from app.models.user import User
from app.models.organization import Organization
from app.db.base import SessionLocal

DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"


def ensure_default_org() -> str:
    """Create the default org if it doesn't exist; return its id."""
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.id == DEFAULT_ORG_ID).first()
        if org:
            return org.id
        org = Organization(
            id=DEFAULT_ORG_ID,
            name="Default Organization",
            code="default",
            contact_email="admin@hmeayc.local",
            is_active=True,
        )
        db.add(org)
        db.commit()
        return org.id
    finally:
        db.close()


def effective_org_id(user: User | None, provided_org_id: str | None = None) -> str:
    """Resolve org_id from user JWT, explicit param, or default."""
    if user is not None:
        return user.org_id if user.org_id is not None else ""
    if provided_org_id:
        return provided_org_id
    return DEFAULT_ORG_ID
