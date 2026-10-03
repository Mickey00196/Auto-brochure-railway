from __future__ import annotations

from app.auth import hash_password
from app.models.user import User


def _make_user(db_session, email="broker@example.test", password="secretpass1"):
    user = User(email=email, name="Test Broker", hashed_password=hash_password(password))
    db_session.add(user)
    db_session.commit()
    return user


def test_login_succeeds_with_correct_credentials(raw_client, db_session):
    _make_user(db_session)
    res = raw_client.post("/auth/login", json={"email": "broker@example.test", "password": "secretpass1"})
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["user"]["email"] == "broker@example.test"
    assert "hashed_password" not in body["user"]


def test_login_rejects_wrong_password(raw_client, db_session):
    _make_user(db_session)
    res = raw_client.post("/auth/login", json={"email": "broker@example.test", "password": "wrong"})
    assert res.status_code == 401


def test_login_rejects_unknown_email(raw_client):
    res = raw_client.post("/auth/login", json={"email": "nobody@example.test", "password": "whatever"})
    assert res.status_code == 401


def test_protected_route_rejects_missing_token(raw_client):
    assert raw_client.get("/buildings").status_code == 401


def test_protected_route_rejects_garbage_token(raw_client):
    raw_client.headers.update({"Authorization": "Bearer not-a-real-token"})
    assert raw_client.get("/buildings").status_code == 401


def test_protected_route_accepts_valid_token(raw_client, db_session):
    _make_user(db_session)
    login = raw_client.post("/auth/login", json={"email": "broker@example.test", "password": "secretpass1"})
    token = login.json()["access_token"]
    raw_client.headers.update({"Authorization": f"Bearer {token}"})
    assert raw_client.get("/buildings").status_code == 200


def test_health_needs_no_auth(raw_client):
    assert raw_client.get("/health").status_code == 200


def test_me_returns_current_user(client):
    res = client.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == "test@example.test"
