"""Application Settings for AirSense AI Backend."""
import os
from typing import List


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://airsense:airsense_secure_pass@localhost:5432/airsense_db",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    OPENAQ_API_KEY: str = os.getenv("OPENAQ_API_KEY", "")
    CORS_ORIGINS: List[str] = [
        "*",
        "https://air-sense-ai-six.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]


settings = Settings()
