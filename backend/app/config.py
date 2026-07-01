from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://hmeayc:hmeayc@localhost:5432/hmeayc"
    gemini_api_key: str = ""
    cors_origins: str = "*"

    class Config:
        env_file = ".env"


settings = Settings()
