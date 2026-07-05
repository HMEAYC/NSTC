from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+psycopg2://hmeayc:hmeayc@localhost:5432/hmeayc"
    gemini_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    jwt_secret: str = "hmeayc-jwt-secret-change-in-production"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@hmeayc.local"
    app_base_url: str = "http://localhost:5173"

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
