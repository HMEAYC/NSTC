from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.user import User
from app.models.organization import Organization
from app.auth.jwt import create_access_token, verify_password, get_password_hash
from app.auth.deps import require_login

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    org_id: str | None
    role: str
    display_name: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    org_id: str | None
    org_name: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    org_code: str


@router.post("/api/auth/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.password_hash is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account not yet activated. Please check your email for the invitation link.")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    token = create_access_token({"sub": user.id, "org_id": user.org_id, "role": user.role})
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        role=user.role,
        display_name=user.display_name or "",
    )


@router.post("/api/auth/refresh", response_model=LoginResponse)
def refresh_token(current_user: User = Depends(require_login)):
    token = create_access_token({"sub": current_user.id, "org_id": current_user.org_id, "role": current_user.role})
    return LoginResponse(
        access_token=token,
        user_id=current_user.id,
        org_id=current_user.org_id,
        role=current_user.role,
        display_name=current_user.display_name or "",
    )


@router.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(require_login), db: Session = Depends(get_db)):
    org_name = None
    if current_user.org_id:
        org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
        if org:
            org_name = org.name
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        org_id=current_user.org_id,
        org_name=org_name,
        is_active=current_user.is_active,
    )


@router.post("/api/auth/register", response_model=UserResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.code == req.org_code).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="機構代碼無效，請向園所確認")
    if not org.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="該機構已停用")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此 Email 已經註冊過")
    user = User(
        org_id=org.id,
        email=req.email,
        password_hash=get_password_hash(req.password),
        display_name=req.display_name,
        role="parent",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class CompleteInviteRequest(BaseModel):
    token: str
    password: str
    display_name: str


@router.post("/api/auth/complete-invite")
def complete_invite(req: CompleteInviteRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.invite_token == req.token).first()
    if not user:
        raise HTTPException(404, "Invalid or expired invite link")
    if user.password_hash is not None:
        raise HTTPException(409, "This invitation has already been used")
    user.password_hash = get_password_hash(req.password)
    user.display_name = req.display_name
    user.is_active = True
    user.invite_token = None
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id, "org_id": user.org_id, "role": user.role})
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        role=user.role,
        display_name=user.display_name or "",
    )
