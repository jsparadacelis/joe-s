"""API entry point (FastAPI). It only wires things up; the logic lives in application."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.access.domain.errors import NotPermitted
from backend.app.api.cadastre_routes import router as cadastre_routes
from backend.app.api.me_routes import router as me_routes
from backend.app.api.member_routes import router as member_routes
from backend.app.api.opportunity_routes import router as opportunity_routes
from backend.app.api.pause_routes import router as pause_routes
from backend.app.api.plan_routes import router as plan_routes
from backend.app.api.project_member_routes import router as project_member_routes
from backend.app.api.promotion_routes import router as promotion_routes
from backend.app.api.scoring_routes import router as scoring_routes
from backend.app.shared.config import Settings
from backend.app.shared.db import close_pools, open_pool


def _invalid_request() -> JSONResponse:
    """Same `{detail: {code, message}}` shape as the domain errors, instead of FastAPI's list."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "invalid_request",
                "message": "La solicitud no es válida. Revisa los datos enviados.",
            }
        },
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.auth_mode == "dev" and settings.environment.lower() == "production":
        logging.getLogger(__name__).warning(
            "AUTH_MODE=dev in production: every request runs as the fictitious development user."
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.db_pool_max > 0:
            open_pool(settings.database_url, max_size=settings.db_pool_max)
        yield
        close_pools()

    app = FastAPI(title="RGB Proyectos", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        return _invalid_request()

    @app.exception_handler(NotPermitted)
    def not_permitted(request: Request, error: NotPermitted) -> JSONResponse:
        return JSONResponse(
            status_code=403, content={"detail": {"code": error.code, "message": error.message}}
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        # FastAPI answers 400 (not 422) when the body cannot even be parsed, e.g. an integer
        # with more than 4300 digits. Same answer as any other malformed request.
        if error.status_code == 400 and error.detail == "There was an error parsing the body":
            return _invalid_request()
        return await http_exception_handler(request, error)

    app.include_router(promotion_routes)
    app.include_router(plan_routes)
    app.include_router(opportunity_routes)
    app.include_router(pause_routes)
    app.include_router(scoring_routes)
    app.include_router(member_routes)
    app.include_router(me_routes)
    app.include_router(project_member_routes)
    app.include_router(cadastre_routes)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
