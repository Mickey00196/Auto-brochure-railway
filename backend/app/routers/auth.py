from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# Off by default: every logged-in user in this app can see and edit every
# Building/Client/Proposal (§19, no per-user scoping), so open signup means
# anyone who finds the URL gets full read/write access to all of it. Only
# turn this on for a throwaway test deployment, not anything with real data.
SIGNUP_ENABLED = os.environ.get("ALLOW_SIGNUP", "").lower() in ("1", "true", "yes")


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    token = create_access_token(user.user_id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if not SIGNUP_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    email = payload.email.strip().lower()
    if not email or not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email and password are required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists")
    user = User(
        email=email,
        name=payload.name or email,
        hashed_password=hash_password(payload.password),
        role=UserRole.BROKER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.user_id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
