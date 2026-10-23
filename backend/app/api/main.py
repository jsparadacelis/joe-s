"""API entry point (FastAPI). It only wires things up; the logic lives in application."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.promotion_routes import router as promotion_routes
from backend.app.shared.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="RGB Proyectos")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(promotion_routes)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
