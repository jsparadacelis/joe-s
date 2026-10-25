"""Backend configuration read from the environment."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://rgb:rgb@localhost:54329/rgb"
    # Fictitious context until authentication exists (RGB-2).
    dev_study_id: str = "00000000-0000-0000-0000-00000000e001"
    dev_user_id: str = "sample-user"
    dev_role: str = "partner"
    dev_qualifications: Annotated[list[str], NoDecode] = []
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # `dev`: every request runs as the fictitious context above. `supabase`: every business
    # route requires a Supabase Auth access token (RGB-2).
    auth_mode: Literal["dev", "supabase"] = "dev"
    supabase_url: str = ""
    environment: str = "development"

    @model_validator(mode="after")
    def _supabase_mode_needs_a_project_url(self):
        if self.auth_mode == "supabase" and not self.supabase_url.strip():
            raise ValueError("AUTH_MODE=supabase requiere SUPABASE_URL")
        return self

    @field_validator("cors_origins", "dev_qualifications", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value
