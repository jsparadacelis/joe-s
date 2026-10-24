"""API entry point (FastAPI). It only wires things up; the logic lives in application."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.opportunity_routes import router as opportunity_routes
from backend.app.api.plan_routes import router as plan_routes
from backend.app.api.promotion_routes import router as promotion_routes
from backend.app.shared.config import Settings


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
    app = FastAPI(title="RGB Proyectos")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        return _invalid_request()

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

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
