"""Generate JWTs signed by an in-memory RSA key, plus matching JWKS payload.

Used in tests to exercise the JWT verifier without hitting Supabase.
"""
from __future__ import annotations

import json
import time
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from jose.utils import long_to_base64


_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_KID = "test-key-1"


def jwks_payload() -> dict:
    pub = _PRIVATE_KEY.public_key().public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "kid": _KID,
                "use": "sig",
                "alg": "RS256",
                "n": long_to_base64(pub.n).decode(),
                "e": long_to_base64(pub.e).decode(),
            }
        ]
    }


def make_token(
    *,
    user_id: uuid.UUID | None = None,
    email: str = "test@example.com",
    audience: str = "authenticated",
    expires_in: int = 3600,
) -> str:
    user_id = user_id or uuid.uuid4()
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "email": email,
        "aud": audience,
        "iat": now,
        "exp": now + expires_in,
        "role": "authenticated",
    }
    pem = _PRIVATE_KEY.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": _KID})
