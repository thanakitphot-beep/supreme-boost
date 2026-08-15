import os
from functools import lru_cache

from pydantic import AnyHttpUrl, BaseModel, Field

try:  # pydantic-settings is installed by the project dependency set.
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError:  # Allows the deterministic development mode to run without pip packages.
    BaseSettings = None
    SettingsConfigDict = None


if BaseSettings is not None:
    class Settings(BaseSettings):
        """Runtime settings. Secrets are environment-only and never sent by a browser."""

        model_config = SettingsConfigDict(env_file=".env", env_prefix="INDICATOR_", extra="ignore")

        env: str = "development"
        rag_backend: str = Field(default="memory", pattern="^(memory|qdrant)$")
        database_url: str = "postgresql+asyncpg://indicator:indicator@localhost:5432/indicator"
        redis_url: str = "redis://localhost:6379/0"
        qdrant_url: AnyHttpUrl = "http://localhost:6333"
        qdrant_collection: str = "indicator_knowledge"
        embedding_dimensions: int = Field(default=1024, ge=64, le=4096)
        conversation_store_path: str = "data/conversations.json"
        conversation_ttl_hours: int = Field(default=720, ge=1, le=24 * 365)
        model_base_url: AnyHttpUrl | None = None
        model_name: str | None = None
        model_api_key: str | None = None
else:
    class Settings(BaseModel):
        """Small fallback for development when optional packages are absent."""

        env: str = os.getenv("INDICATOR_ENV", "development")
        rag_backend: str = os.getenv("INDICATOR_RAG_BACKEND", "memory")
        database_url: str = os.getenv("INDICATOR_DATABASE_URL", "postgresql+asyncpg://indicator:indicator@localhost:5432/indicator")
        redis_url: str = os.getenv("INDICATOR_REDIS_URL", "redis://localhost:6379/0")
        qdrant_url: AnyHttpUrl = os.getenv("INDICATOR_QDRANT_URL", "http://localhost:6333")
        qdrant_collection: str = os.getenv("INDICATOR_QDRANT_COLLECTION", "indicator_knowledge")
        embedding_dimensions: int = int(os.getenv("INDICATOR_EMBEDDING_DIMENSIONS", "1024"))
        conversation_store_path: str = os.getenv("INDICATOR_CONVERSATION_STORE_PATH", "data/conversations.json")
        conversation_ttl_hours: int = int(os.getenv("INDICATOR_CONVERSATION_TTL_HOURS", "720"))
        model_base_url: AnyHttpUrl | None = os.getenv("INDICATOR_MODEL_BASE_URL") or None
        model_name: str | None = os.getenv("INDICATOR_MODEL_NAME") or None
        model_api_key: str | None = os.getenv("INDICATOR_MODEL_API_KEY") or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
