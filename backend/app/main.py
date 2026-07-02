from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.video_analysis import router as video_analysis_router
from app.api.sessions import router as sessions_router
from app.api.reports import router as reports_router
from app.api.ws import router as ws_router
from app.api.firmware import router as firmware_router
from app.api.devices import router as devices_router
from app.api.config import router as config_router
from app.db.base import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="HMEAYC AI Engine",
    description="Real-time IMU analysis, Gemini report generation, and video analysis pipeline",
    version="0.1.0",
    lifespan=lifespan,
)

cors_origins = settings.cors_origin_list()
allow_all_origins = cors_origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins and not allow_all_origins else ["*"],
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video_analysis_router)
app.include_router(sessions_router)
app.include_router(reports_router)
app.include_router(firmware_router)
app.include_router(devices_router)
app.include_router(config_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
