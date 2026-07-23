from __future__ import annotations
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth.deps import require_role, same_org
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


def _class_code_from_name(name: str) -> str:
    base = name.rstrip("班") if name.endswith("班") else name
    return base[:10] if base else "C"


def _prefix_student_id(code: str | None, student_id: str) -> str:
    if not code or not student_id:
        return student_id
    return f"{code}-{student_id}"


def _strip_student_id_prefix(code: str | None, student_id: str | None) -> str | None:
    if not code or not student_id:
        return student_id
    prefix = f"{code}-"
    return student_id[len(prefix):] if student_id.startswith(prefix) else student_id


class OrgResponse(BaseModel):
    id: str
    name: str
    code: str
    contact_email: str | None
    is_active: bool
    created_at: datetime | None

    model_config = {"from_attributes": True}


class ClassResponse(BaseModel):
    id: str
    org_id: str
    name: str
    code: str | None = None
    grade: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    role: str
    org_id: str | None = None
    is_active: bool
    invite_token: str | None = None

    model_config = {"from_attributes": True}


class ChildResponse(BaseModel):
    id: str
    name: str
    student_id: str | None
    class_id: str | None
    notes: str | None = None
    created_at: datetime | None

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
    return {"orgs": [OrgResponse.model_validate(o) for o in orgs]}


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
    return {"org": OrgResponse.model_validate(org)}


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
    return {"org": OrgResponse.model_validate(org)}


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
    return {"classes": [ClassResponse.model_validate(c) for c in classes]}


@router.get("/api/classes")
def list_all_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "teacher", "super_admin")),
):
    if current_user.role == "super_admin":
        classes = db.query(SchoolClass).all()
    elif current_user.role == "teacher":
        from app.models.session import Session as SessionModel
        class_ids = list({
            s.class_id for s in db.query(SessionModel.class_id).filter(
                SessionModel.teacher_id == current_user.id,
                SessionModel.class_id.isnot(None),
            ).distinct().all()
        })
        if not class_ids:
            return {"classes": []}
        classes = db.query(SchoolClass).filter(SchoolClass.id.in_(class_ids)).all()
    else:
        classes = db.query(SchoolClass).filter(SchoolClass.org_id == current_user.org_id).all()
    return {"classes": [ClassResponse.model_validate(c) for c in classes]}


@router.post("/api/orgs/{org_id}/classes")
def create_class(
    org_id: str, name: str, grade: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    cls = SchoolClass(org_id=org_id, name=name, code=_class_code_from_name(name), grade=grade)
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {"class": ClassResponse.model_validate(cls)}


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
        cls.code = _class_code_from_name(name)
    if grade is not None:
        cls.grade = grade
    db.commit()
    db.refresh(cls)
    return {"class": ClassResponse.model_validate(cls)}


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
    result = []
    for c in children:
        info = ChildResponse.model_validate(c).model_dump()
        info["student_id"] = _strip_student_id_prefix(cls.code, info.get("student_id"))
        result.append(info)
    return {"children": result}


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
    prefixed_sid = _prefix_student_id(cls.code, student_id) if student_id else None
    if prefixed_sid:
        existing = db.query(Child).filter(Child.student_id == prefixed_sid).first()
        if existing:
            raise HTTPException(400, "學號已被其他幼兒使用")
    child = Child(
        org_id=cls.org_id,
        class_id=class_id,
        added_by=current_user.id,
        name=name,
        student_id=prefixed_sid,
        notes=notes,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    info = ChildResponse.model_validate(child).model_dump()
    info["student_id"] = _strip_student_id_prefix(cls.code, info.get("student_id"))
    return {"child": info}


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
    class_code = None
    if child.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == child.class_id).first()
        class_code = cls.code if cls else None
    if name is not None:
        child.name = name
    if student_id is not None:
        prefixed = _prefix_student_id(class_code, student_id)
        existing = db.query(Child).filter(Child.student_id == prefixed, Child.id != child_id).first()
        if existing:
            raise HTTPException(400, "學號已被其他幼兒使用")
        child.student_id = prefixed
    if notes is not None:
        child.notes = notes
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "儲存失敗，學號可能重複")
    db.refresh(child)
    info = ChildResponse.model_validate(child).model_dump()
    info["student_id"] = _strip_student_id_prefix(class_code, info.get("student_id"))
    return {"child": info}


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


# ─── Class Teachers ───────────────────────────────────────────────

@router.get("/api/classes/{class_id}/teachers")
def list_class_teachers(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    bindings = db.query(TeacherClass).filter(TeacherClass.class_id == class_id).all()
    teacher_ids = [b.teacher_id for b in bindings]
    teachers = db.query(User).filter(User.id.in_(teacher_ids)).all() if teacher_ids else []
    return {
        "teachers": [
            {"id": t.id, "email": t.email, "display_name": t.display_name, "role": t.role}
            for t in teachers
        ]
    }


@router.post("/api/classes/{class_id}/teachers/{teacher_id}")
def bind_class_teacher(
    class_id: str,
    teacher_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    teacher = db.query(User).filter(User.id == teacher_id).first()
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    existing = db.query(TeacherClass).filter(
        TeacherClass.teacher_id == teacher_id, TeacherClass.class_id == class_id
    ).first()
    if existing:
        return {"status": "already_bound"}
    binding = TeacherClass(teacher_id=teacher_id, class_id=class_id)
    db.add(binding)
    db.commit()
    return {"status": "bound"}


@router.delete("/api/classes/{class_id}/teachers/{teacher_id}")
def unbind_class_teacher(
    class_id: str,
    teacher_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    if not cls:
        raise HTTPException(404, "Class not found")
    same_org(cls.org_id, current_user)
    binding = db.query(TeacherClass).filter(
        TeacherClass.teacher_id == teacher_id, TeacherClass.class_id == class_id
    ).first()
    if not binding:
        raise HTTPException(404, "Binding not found")
    db.delete(binding)
    db.commit()
    return {"status": "unbound"}


# ─── Users (org users management) ────────────────────────────────

@router.get("/api/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin", "teacher")),
):
    if current_user.role == "super_admin":
        users = db.query(User).all()
    elif current_user.role == "teacher":
        from app.models.session import Session as SessionModel
        class_ids = list({
            s.class_id for s in db.query(SessionModel.class_id).filter(
                SessionModel.teacher_id == current_user.id,
                SessionModel.class_id.isnot(None),
            ).distinct().all()
        })
        if not class_ids:
            return {"users": []}
        child_ids = [c.id for c in db.query(Child).filter(Child.class_id.in_(class_ids)).all()]
        if not child_ids:
            return {"users": []}
        parent_ids = list({pc.parent_id for pc in db.query(ParentChild).filter(ParentChild.child_id.in_(child_ids)).all()})
        if not parent_ids:
            return {"users": []}
        users = db.query(User).filter(User.id.in_(parent_ids)).all()
    else:
        users = db.query(User).filter(User.org_id == current_user.org_id).all()

    parent_ids = [u.id for u in users if u.role == "parent"]
    bindings = db.query(ParentChild).filter(ParentChild.parent_id.in_(parent_ids)).all() if parent_ids else []
    child_ids = list({b.child_id for b in bindings})
    children = db.query(Child).filter(Child.id.in_(child_ids)).all() if child_ids else []
    child_map = {c.id: c for c in children}
    class_ids = list({c.class_id for c in children if c.class_id})
    classes = db.query(SchoolClass).filter(SchoolClass.id.in_(class_ids)).all() if class_ids else []
    class_map = {cls.id: cls.name for cls in classes}

    parent_children_map: dict[str, list[str]] = {}
    for b in bindings:
        child = child_map.get(b.child_id)
        if child:
            class_name = class_map.get(child.class_id, "") if child.class_id else ""
            label = f"{class_name}-{child.name}" if class_name else child.name
        else:
            label = "未知"
        parent_children_map.setdefault(b.parent_id, []).append(label)

    result = []
    for u in users:
        info = UserResponse.model_validate(u).model_dump()
        if u.role == "parent":
            info["children"] = parent_children_map.get(u.id, [])
        result.append(info)
    return {"users": result}


@router.get("/api/orgs/{org_id}/users")
def list_org_users(
    org_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    same_org(org_id, current_user)
    users = db.query(User).filter(User.org_id == org_id).all()

    parent_ids = [u.id for u in users if u.role == "parent"]
    bindings = db.query(ParentChild).filter(ParentChild.parent_id.in_(parent_ids)).all() if parent_ids else []
    child_ids = list({b.child_id for b in bindings})
    children = db.query(Child).filter(Child.id.in_(child_ids)).all() if child_ids else []
    child_map = {c.id: c for c in children}
    class_ids = list({c.class_id for c in children if c.class_id})
    classes = db.query(SchoolClass).filter(SchoolClass.id.in_(class_ids)).all() if class_ids else []
    class_map = {cls.id: cls.name for cls in classes}

    parent_children_map: dict[str, list[str]] = {}
    for b in bindings:
        child = child_map.get(b.child_id)
        if child:
            class_name = class_map.get(child.class_id, "") if child.class_id else ""
            label = f"{class_name}-{child.name}" if class_name else child.name
        else:
            label = "未知"
        parent_children_map.setdefault(b.parent_id, []).append(label)

    result = []
    for u in users:
        info = UserResponse.model_validate(u).model_dump()
        if u.role == "parent":
            info["children"] = parent_children_map.get(u.id, [])
        result.append(info)
    return {"users": result}


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


_VALID_ROLES = {"teacher", "org_admin", "parent"}


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
        if body.is_active:
            user.invite_token = None
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.password is not None:
        user.password_hash = get_password_hash(body.password)
    if body.role is not None and current_user.role in ("super_admin", "org_admin"):
        if body.role not in _VALID_ROLES:
            raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(sorted(_VALID_ROLES))}")
        if body.role == "super_admin" and current_user.role != "super_admin":
            raise HTTPException(403, "Only super_admin can assign super_admin role")
        user.role = body.role
    db.commit()
    db.refresh(user)
    return {"user": UserResponse.model_validate(user)}


@router.post("/api/users/{user_id}/resend-invite")
def resend_invite(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("org_admin", "super_admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    same_org(user.org_id, current_user)
    if user.password_hash is not None:
        raise HTTPException(400, "User already activated — cannot resend invite")
    invite_token = str(uuid.uuid4())
    user.invite_token = invite_token
    db.commit()
    org = db.query(Organization).filter(Organization.id == user.org_id).first()
    send_invite_email(user.email, invite_token, current_user.display_name, org.name if org else "機構")
    return {"status": "sent", "email": user.email}


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
    return {"parents": [{"id": p.id, "email": p.email, "display_name": p.display_name} for p in parents]}


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
    return {"parents": [{"id": p.id, "email": p.email, "display_name": p.display_name} for p in parents]}


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
    result = []
    for c in children:
        code = None
        if c.class_id:
            cls = db.query(SchoolClass).filter(SchoolClass.id == c.class_id).first()
            code = cls.code if cls else None
        result.append({
            "id": c.id,
            "name": c.name,
            "student_id": _strip_student_id_prefix(code, c.student_id),
            "class_id": c.class_id,
            "notes": c.notes,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return {"children": result}


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
