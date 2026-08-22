import os
from fastapi import Header, HTTPException


def require_internal_auth(
    x_internal_token: str | None = Header(default=None)
):
    required = os.getenv("SCORER_AUTH_REQUIRED", "").lower()

    if required != "true":
        raise HTTPException(
            status_code=500,
            detail="SCORER_AUTH_REQUIRED must be explicitly enabled"
        )

    expected = os.getenv("SCORER_INTERNAL_TOKEN")

    if not expected:
        raise HTTPException(
            status_code=500,
            detail="SCORER_INTERNAL_TOKEN is missing"
        )

    if x_internal_token != expected:
        raise HTTPException(
            status_code=401,
            detail="Invalid internal token"
        )

    return True
