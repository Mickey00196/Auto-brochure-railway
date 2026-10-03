from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.seed.seed_data import seed_database


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401 register models on Base.metadata

    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def seeded_proposal(db_session):
    return seed_database(db_session)


@pytest.fixture()
def raw_client(db_session):
    """An unauthenticated TestClient — for auth.py's own tests, which need
    to exercise the 401 path rather than have it overridden away."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def client(raw_client, db_session):
    """The default client every non-auth test uses — every route except
    /auth/login and /health requires a logged-in user (app/main.py), so this
    fixture provisions one test user and carries its token on every request."""
    user = User(email="test@example.test", name="Test User", hashed_password=hash_password("testpass123"))
    db_session.add(user)
    db_session.commit()
    login = raw_client.post("/auth/login", json={"email": user.email, "password": "testpass123"})
    token = login.json()["access_token"]
    raw_client.headers.update({"Authorization": f"Bearer {token}"})
    return raw_client
