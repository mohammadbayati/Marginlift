"""Internal service authentication for scorer endpoints."""

from __future__ import annotations

import os
import secrets
from collections.abc import Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI, Request

SCORER_AUTH_HEADER = "x-marginlift-internal-token"
SCORER_AUTH_KEY_ID_HEADER = "x-marginlift-internal-key-id"

PUBLIC_PATHS = {"/health"}


def is_public_path(path: str) -> bool:
    return path in PUBLIC_PATHS


def configured_tokens() -> list[str]:
    values: list[str] = []
    for key in ("SCORER_INTERNAL_TOKEN", "SCORER_INTERNAL_TOKEN_PREVIOUS"):
        value = os.environ.get(key, "").strip()
        if value:
            values.append(value)

    for value in os.environ.get("SCORER_INTERNAL_TOKENS", "").split(","):
        token = value.strip()
        if token:
            values.append(token)

    deduped: list[str] = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    return deduped


def auth_required() -> bool:
    explicit = os.environ.get("SCORER_AUTH_REQUIRED", "").strip().lower()
    if explicit in {"1", "true", "yes"}:
        return True
    if explicit in {"0", "false", "no"}:
        return False
    return bool(configured_tokens())


def verify_internal_token(provided: str | None) -> bool:
    tokens = configured_tokens()
    if not tokens:
        return not auth_required()
    if not provided:
        return False
    return any(secrets.compare_digest(provided, token) for token in tokens)


def install_internal_auth(app: "FastAPI") -> None:
    from fastapi.responses import JSONResponse

    @app.middleware("http")
    async def internal_auth_middleware(request: "Request", call_next: Callable):
        if is_public_path(request.url.path):
            return await call_next(request)

        if not auth_required():
            return await call_next(request)

        tokens = configured_tokens()
        if not tokens:
            return JSONResponse(
                {"detail": "Internal scorer authentication is not configured."},
                status_code=503,
            )

        provided = request.headers.get(SCORER_AUTH_HEADER)
        if not verify_internal_token(provided):
            return JSONResponse({"detail": "Unauthorized internal scorer request."}, status_code=401)

        return await call_next(request)
