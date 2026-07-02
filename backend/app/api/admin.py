from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_role, same_org
from app.auth.jwt import get_password_hash
from app.db.base import get_db
from app.models.organization import Organization
from app.models.school_class import SchoolClass
from app.models.user import User
from app.models.child import Child
from app.models.parent_child import ParentChild
from app.models.teacher_class import TeacherClass

router = APIRouter(tags=["admin"])


class OrgResponse(BaseModel):
    id: str
    name: str
    code: str
    contact_email: str | None
    is_active: bool
    created_at: str | None

    model_config = {"from_attributes": True}


class ClassResponse(BaseModel):
    id: str
    org_id: str
    name: str
    grade: str | None
    created_at: str | None

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    org_id: str
    is_active: bool

    model_config = {"from_attributes": True}


class ChildResponse(BaseModel):
    id: str
    name: str
    student_id: str | None
    class_id: str | None
    created_at: str | None

    model_config = {"from_attributes": True}


# ─── Organizations ───────────────────────────────────────────────

@router.get("/api/admin/orgs")
def list_orgs(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin")),
):
    orgs = db.query(Organization).all()
    return {"orgs": orgs}


@router.post("/api/admin/orgs")
def create_org(
    name: str, code: str, contact_email: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin")),
):
    if db.query(Organization).filter(Organization.code == code).first():
        raise HTTPException(409, "Organization code already exists")
    org = Organization(name=name, code=code, contact_email=contact_email)
    db.add(org)
    db.commit()
    db.refresh(org)
    return {"org": org}


# ─── Classes ─────────────────────────────────────────────────────

@router.get("/api/orgs/{org_id}/classes")
def list_classes(
    org_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "teacher", "super_admin")),
):
    same_org(org_id, current_user)
    classes = db.query(SchoolClass).filter(SchoolClass.org_id == org_id).all()
    return {"classes": classes}


@router.post("/api/orgs/{org_id}/classes")
def create_class(
    org_id: str, name: str, grade: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    cls = SchoolClass(org_id=org_id, name=name, grade=grade)
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {"class": cls}


@router.put("/api/classes/{class_id}")
def update_class(
    class_id: str, name: str | None = None, grade: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    if name is not None:
        cls.name = name
    if grade is not None:
        cls.grade = grade
    db.commit()
    db.refresh(cls)
    return {"class": cls}


@router.delete("/api/classes/{class_id}")
def delete_class(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    db.delete(cls)
    db.commit()
    return {"status": "deleted"}


@router.get("/api/classes/{class_id}/children")
def list_class_children(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "teacher", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    children = db.query(Child).filter(Child.class_id == class_id).all()
    return {"children": children}


# ─── Users (org users management) ────────────────────────────────

@router.get("/api/orgs/{org_id}/users")
def list_org_users(
    org_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    users = db.query(User).filter(User.org_id == org_id).all()
    return {"users": users}


@router.post("/api/orgs/{org_id}/users")
def create_org_user(
    org_id: str,
    email: EmailStr,
    password: str,
    display_name: str,
    role: str = "teacher",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email already registered")
    user = User(
        org_id=org_id,
        email=email,
        password_hash=get_password_hash(password),
        display_name=display_name,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"user": user}


@router.put("/api/users/{user_id}")
def update_user(
    user_id: str,
    is_active: bool | None = None,
    display_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    same_org(user.org_id, current_user)
    if is_active is not None:
        user.is_active = is_active
    if display_name is not None:
        user.display_name = display_name
    db.commit()
    db.refresh(user)
    return {"user": user}


# ─── Parent-Child Binding ────────────────────────────────────────

@router.post("/api/children/{child_id}/parents")
def bind_parent(
    child_id: str,
    parent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    if current_user.role != "super_admin":
        same_org(child.org_id, current_user)
    parent = db.query(User).filter(User.id == parent_id, User.role == "parent").first()
    if not parent:
        raise HTTPException(404, "Parent user not found")
    existing = db.query(ParentChild).filter(
        ParentChild.parent_id == parent_id,
        ParentChild.child_id == child_id,
    ).first()
    if existing:
        return {"status": "already_bound"}
    pc = ParentChild(parent_id=parent_id, child_id=child_id)
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return {"status": "bound", "id": pc.id}


@router.get("/api/parents/me/children")
def list_my_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("parent")),
):
    bindings = db.query(ParentChild).filter(ParentChild.parent_id == current_user.id).all()
    child_ids = [b.child_id for b in bindings]
    children = db.query(Child).filter(Child.id.in_(child_ids)).all()
    return {"children": children}


@router.delete("/api/parents/{parent_id}/children/{child_id}")
def unbind_parent(
    parent_id: str,
    child_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    pc = db.query(ParentChild).filter(
        ParentChild.parent_id == parent_id,
        ParentChild.child_id == child_id,
    ).first()
    if not pc:
        raise HTTPException(404, "Binding not found")
    db.delete(pc)
    db.commit()
    return {"status": "unbound"}
