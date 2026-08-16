"""MarginLift Shadow Scoring Service.

Internal microservice for ML-based uplift scoring.
Called by the Node.js gateway — not exposed externally.
"""

from fastapi import FastAPI
from routes.shadow_mode import router as shadow_router
from routes.orchestration import router as orchestration_router

app = FastAPI(
    title="MarginLift Shadow Scorer",
    version="1.0.0",
    docs_url="/internal/docs",
    redoc_url=None,
)

app.include_router(shadow_router, prefix="/api/v1/shadow")
app.include_router(orchestration_router, prefix="/api/v1/orchestrate")


@app.get("/health")
async def health():
    from models.uplift_evaluator import MODEL_SOURCE
    return {"status": "ok", "service": "shadow-scorer", "model": MODEL_SOURCE}
