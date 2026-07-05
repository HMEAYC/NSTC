from __future__ import annotations
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_role, same_org
from app.auth.jwt import get_password_hash
from app.db.base import get_db
from app.email import send_invite_email
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
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    if current_user.role == "super_admin":
        orgs = db.query(Organization).all()
    else:
        orgs = db.query(Organization).filter(Organization.id == current_user.org_id).all()
    return {"orgs": orgs}


class CreateOrgRequest(BaseModel):
    name: str
    code: str
    contact_email: str | None = None


@router.post("/api/admin/orgs")
def create_org(
    body: CreateOrgRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin")),
):
    if db.query(Organization).filter(Organization.code == body.code).first():
        raise HTTPException(409, "Organization code already exists")
    org = Organization(
        name=body.name,
        code=body.code,
        contact_email=body.contact_email,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return {"org": org}


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    contact_email: str | None = None


@router.put("/api/admin/orgs/{org_id}")
def update_org(
    org_id: str,
    body: UpdateOrgRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin")),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.name is not None:
        org.name = body.name
    if body.code is not None:
        if db.query(Organization).filter(Organization.code == body.code, Organization.id != org_id).first():
            raise HTTPException(409, "Code already in use")
        org.code = body.code
    if body.contact_email is not None:
        org.contact_email = body.contact_email
    db.commit()
    db.refresh(org)
    return {"org": org}


@router.delete("/api/admin/orgs/{org_id}")
def delete_org(
    org_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin")),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    db.delete(org)
    db.commit()
    return {"status": "deleted"}


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


@router.post("/api/classes/{class_id}/children")
def create_class_child(
    class_id: str,
    name: str,
    student_id: str | None = None,
    notes: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    child = Child(
        org_id=cls.org_id,
        class_id=class_id,
        added_by=current_user.id,
        name=name,
        student_id=student_id,
        notes=notes,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return {"child": child}


@router.put("/api/children/{child_id}")
def update_child(
    child_id: str,
    name: str | None = None,
    student_id: str | None = None,
    notes: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    same_org(child.org_id, current_user)
    if name is not None:
        child.name = name
    if student_id is not None:
        child.student_id = student_id
    if notes is not None:
        child.notes = notes
    db.commit()
    db.refresh(child)
    return {"child": child}


@router.delete("/api/children/{child_id}")
def delete_child(
    child_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    same_org(child.org_id, current_user)
    db.delete(child)
    db.commit()
    return {"status": "deleted"}


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


class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str = "teacher"


@router.post("/api/orgs/{org_id}/invite")
def invite_user(
    org_id: str,
    body: InviteUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "Email already registered")
    invite_token = str(uuid.uuid4())
    user = User(
        org_id=org_id,
        email=body.email,
        role=body.role,
        is_active=False,
        invite_token=invite_token,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    org = db.query(Organization).filter(Organization.id == org_id).first()
    send_invite_email(body.email, invite_token, current_user.display_name, org.name if org else "機構")

    return {"user": {"id": user.id, "email": user.email, "role": user.role, "org_id": user.org_id}}


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None
    display_name: str | None = None
    password: str | None = None
    role: str | None = None


@router.put("/api/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    same_org(user.org_id, current_user)
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.password is not None:
        user.password_hash = get_password_hash(body.password)
    if body.role is not None and current_user.role == "super_admin":
        user.role = body.role
    db.commit()
    db.refresh(user)
    return {"user": user}


@router.get("/api/orgs/{org_id}/parents")
def search_parents(
    org_id: str,
    q: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    query = db.query(User).filter(User.org_id == org_id, User.role == "parent")
    if q:
        like = f"%{q}%"
        query = query.filter(
            User.email.ilike(like) | User.display_name.ilike(like)
        )
    parents = query.order_by(User.display_name).all()
    return {"parents": parents}


@router.get("/api/children/{child_id}/parents")
def list_child_parents(
    child_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    child = db.query(Child).filter(Child.id == child_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    if current_user.role != "super_admin":
        same_org(child.org_id, current_user)
    bindings = db.query(ParentChild).filter(ParentChild.child_id == child_id).all()
    parent_ids = [b.parent_id for b in bindings]
    parents = db.query(User).filter(User.id.in_(parent_ids)).all() if parent_ids else []
    return {"parents": parents}


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
