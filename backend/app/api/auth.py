from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.user import User
from app.auth.jwt import create_access_token, verify_password, get_password_hash
from app.auth.deps import get_current_user, require_login

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    org_id: str
    role: str
    display_name: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    org_id: str
    is_active: bool

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    role: str = "teacher"
    org_id: str


@router.post("/api/auth/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    token = create_access_token({"sub": user.id, "org_id": user.org_id, "role": user.role})
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        role=user.role,
        display_name=user.display_name,
    )


@router.post("/api/auth/refresh", response_model=LoginResponse)
def refresh_token(current_user: User = Depends(require_login)):
    token = create_access_token({"sub": current_user.id, "org_id": current_user.org_id, "role": current_user.role})
    return LoginResponse(
        access_token=token,
        user_id=current_user.id,
        org_id=current_user.org_id,
        role=current_user.role,
        display_name=current_user.display_name,
    )


@router.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(require_login)):
    return current_user


@router.post("/api/auth/register", response_model=UserResponse)
def register(req: CreateUserRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        org_id=req.org_id,
        email=req.email,
        password_hash=get_password_hash(req.password),
        display_name=req.display_name,
        role=req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
