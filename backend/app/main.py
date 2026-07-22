"""Real Estate Proposal Engine — FastAPI entrypoint.

See spec §2 (overview) and §4 (workflows). Run with:
    uvicorn app.main:app --reload
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, hash_password
from app.database import SessionLocal, init_db
from app.models.enums import UserRole
from app.models.user import User
from app.routers import all_routers
from app.routers import auth as auth_router

# Comma-separated list of allowed browser origins. The frontend normally talks
# to this API server-to-server (see internalApiBaseUrl.ts), so this only
# matters if something calls the API directly from a browser (e.g. hitting
# the Railway backend URL on its own for testing).
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]


def _bootstrap_admin() -> None:
    # There's no public signup and no SSH/console shell on every PaaS (Railway's
    # web console can itself fail to route to the container) — so the very
    # first account has to be creatable without one. Set ADMIN_EMAIL and
    # ADMIN_PASSWORD once, deploy, log in, then unset them; this only ever
    # acts when that exact email doesn't already exist, so leaving them set is
    # inert afterwards rather than resettable-password-forever.
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        return
    email = email.strip().lower()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            return
        db.add(
            User(
                email=email,
                name=os.environ.get("ADMIN_NAME", "Admin"),
                hashed_password=hash_password(password),
                role=UserRole.ADMIN,
            )
        )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _bootstrap_admin()
    yield


app = FastAPI(
    title="Real Estate Proposal Engine",
    description="Institutional-grade CRE brochure/PPTX/PDF generation from a live Building/Unit/Proposal data model.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /auth/login is the one endpoint that must work with no token yet; everything
# else requires a logged-in user (no per-route scoping — see app/auth.py).
app.include_router(auth_router.router)

for router in all_routers:
    app.include_router(router, dependencies=[Depends(get_current_user)])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
