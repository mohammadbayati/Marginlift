"""MarginLift Shadow Scoring Service.

Internal microservice for ML-based uplift scoring.
Called by the Node.js gateway — not exposed externally.
"""

from fastapi import FastAPI
from api.routes.shadow_mode import router as shadow_router

app = FastAPI(
    title="MarginLift Shadow Scorer",
    version="1.0.0",
    docs_url="/internal/docs",
    redoc_url=None,
)

app.include_router(shadow_router, prefix="/api/v1/shadow")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "shadow-scorer"}
