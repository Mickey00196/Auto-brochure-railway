"""SQLAlchemy engine/session setup.

Defaults to a local SQLite file so the app runs with zero configuration;
point DATABASE_URL at Postgres (Supabase) in production per §21.
"""
from __future__ import annotations

import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./phishguard_realestate.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

try:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
except ArgumentError:
    # A bare create_engine() failure here buries the actual problem (an
    # unset/malformed DATABASE_URL) under a wall of SQLAlchemy internals —
    # e.g. an unresolved Railway variable reference like "${{Postgres.DATABASE_URL}}"
    # left as literal text because no service is named "Postgres".
    print(
        "FATAL: DATABASE_URL is set but is not a valid SQLAlchemy connection "
        f"string (got: {DATABASE_URL!r}). On Railway: open the backend "
        "service's Variables tab and either reference your Postgres service "
        "by its actual name (${{<service-name>.DATABASE_URL}}), or copy the "
        "connection string directly from the Postgres service's Variables tab.",
        file=sys.stderr,
    )
    raise
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they're registered on Base.metadata before create_all.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
