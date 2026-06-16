"""
passwords.py — Password hashing with the standard library only.

No bcrypt/argon2 dependency on purpose: the project already fights Windows
C++ build-tool issues for ChromaDB (see requirements.txt), and adding a
compiled crypto dependency would make ``pip install`` fail on the same
machines. PBKDF2-HMAC-SHA256 with a per-password random salt and a high
iteration count is a sound, FIPS-approved choice for password storage at this
scale (a fixed group of teachers, not a public mega-service).

Stored format (single string, ``$``-delimited so it self-describes the params
used — lets us raise the iteration count later without breaking old hashes):

    pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Return a self-describing PBKDF2 hash string for ``password``."""
    if not password:
        raise ValueError("password must not be empty")
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _ITERATIONS
    )
    return f"{_ALGO}${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of ``password`` against a stored hash string."""
    if not password or not stored:
        return False
    try:
        algo, iter_str, salt_hex, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, AttributeError):
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(candidate, expected)
