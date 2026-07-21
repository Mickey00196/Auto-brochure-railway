"""Admin-only account provisioning — there is no public signup route.

Usage (run from backend/, with DATABASE_URL pointed at the real deployment
database if you're provisioning production accounts rather than a local
dev one):

    python -m app.cli create-user --email sam@company.example --name "Sam de Boer" --password "changeme123" --role broker
    python -m app.cli list-users
"""
from __future__ import annotations

import argparse

from app.auth import hash_password
from app.database import SessionLocal, init_db
from app.models.enums import UserRole
from app.models.user import User


def create_user(email: str, name: str, password: str, role: str) -> None:
    init_db()
    db = SessionLocal()
    try:
        email = email.strip().lower()
        if db.query(User).filter(User.email == email).first():
            print(f"A user with email {email} already exists.")
            return
        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(password),
            role=UserRole(role),
        )
        db.add(user)
        db.commit()
        print(f"Created user {email} ({role}).")
    finally:
        db.close()


def list_users() -> None:
    init_db()
    db = SessionLocal()
    try:
        for user in db.query(User).order_by(User.created_at).all():
            status = "active" if user.is_active else "disabled"
            print(f"{user.email}\t{user.name}\t{user.role.value}\t{status}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create-user", help="Provision a new colleague account")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--password", required=True)
    create.add_argument("--role", default="broker", choices=[r.value for r in UserRole])

    subparsers.add_parser("list-users", help="List all provisioned accounts")

    args = parser.parse_args()
    if args.command == "create-user":
        create_user(args.email, args.name, args.password, args.role)
    elif args.command == "list-users":
        list_users()


if __name__ == "__main__":
    main()
