"""Configuración del backend leída del entorno."""

from __future__ import annotations

from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://rgb:rgb@localhost:54329/rgb"
    # Contexto ficticio mientras no haya autenticación (RGB-2).
    dev_estudio_id: str = "00000000-0000-0000-0000-00000000e001"
    dev_usuario_id: str = "usuario-ejemplo"
    dev_rol: str = "socio"
    dev_habilitaciones: Annotated[list[str], NoDecode] = []
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", "dev_habilitaciones", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value
