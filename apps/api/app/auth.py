from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.settings import get_settings


class AuthError(Exception):
    """Raised when a JWT cannot be verified."""


@dataclass(slots=True)
class AuthClaims:
    user_id: uuid.UUID
    email: str


_jwks_cache: dict[str, tuple[float, dict]] = {}
_JWKS_TTL_SECONDS = 3600


async def _fetch_jwks(url: str) -> dict:
    now = time.time()
    cached = _jwks_cache.get(url)
    if cached and cached[0] > now:
        return cached[1]
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        payload = resp.json()
    _jwks_cache[url] = (now + _JWKS_TTL_SECONDS, payload)
    return payload


async def verify_token(token: str) -> AuthClaims:
    settings = get_settings()
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise AuthError("malformed token") from e

    kid = unverified_header.get("kid")
    if not kid:
        raise AuthError("token missing kid")

    jwks = await _fetch_jwks(settings.supabase_jwks_url)
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key is None:
        raise AuthError("no matching jwks key for kid")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience=settings.supabase_jwt_audience,
            options={"require": ["sub", "exp", "aud"]},
        )
    except JWTError as e:
        raise AuthError(str(e)) from e

    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError) as e:
        raise AuthError("invalid sub claim") from e

    return AuthClaims(user_id=user_id, email=claims.get("email", ""))
