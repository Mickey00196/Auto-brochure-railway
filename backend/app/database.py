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
    _add_missing_columns()


def _add_missing_columns() -> None:
    """create_all only creates missing *tables* — a column added to a model
    after a table already exists in the deployed database is silently absent,
    and every SELECT against the model then fails. This closes that gap for
    the simple case we actually have (new nullable columns), without pulling
    in a full migration tool."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                if not column.nullable or column.primary_key:
                    raise RuntimeError(
                        f"Column {table.name}.{column.name} is missing from the database "
                        "and is not a nullable add — write a real migration for it."
                    )
                ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {column.type.compile(engine.dialect)}"
                conn.execute(text(ddl))
                print(f"init_db: added missing column {table.name}.{column.name}")
