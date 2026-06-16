"""Authentication domain — users, sessions, password hashing.

Public API:

    from auth import UserStore, ROLE_ADMIN, ROLE_USER

Internal modules:
    • passwords — stdlib PBKDF2 hash/verify (no compiled crypto dependency)
    • store     — UserStore: users + sessions on the shared SQLite file
"""

from .store import ROLE_ADMIN, ROLE_USER, UserStore

__all__ = ["UserStore", "ROLE_ADMIN", "ROLE_USER"]
