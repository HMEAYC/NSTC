from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.video_analysis import router as video_analysis_router

app = FastAPI(
    title="HMEAYC AI Engine",
    description="Real-time IMU analysis, Gemini report generation, and video analysis pipeline",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video_analysis_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
