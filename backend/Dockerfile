FROM python:3.12-slim

WORKDIR /app

# System libraries required by the ML/media dependencies pulled in below:
# - libgl1/libglib2.0-0/libsm6/libxext6/libxrender1: opencv-python-headless, mediapipe
# - libsndfile1 + ffmpeg: librosa/soundfile (audio decode for music BPM analysis)
# - libpango/libcairo/libgdk-pixbuf/shared-mime-info: weasyprint (PDF report export)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libsndfile1 \
        ffmpeg \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies straight from pyproject.toml's [project.dependencies] instead of a
# hand-maintained duplicate list. The previous hardcoded list silently dropped numpy/scipy/
# librosa/opencv/ultralytics/torch/mediapipe/insightface/onnxruntime/google-genai/weasyprint
# etc. (everything rhythm analysis, music BPM detection, the camera/pose pipeline, ArcFace
# face recognition, Gemini reports, and PDF export actually import), which broke those
# endpoints under `docker compose` while `make dev-backend` (installs the full pyproject.toml
# via `pip install -e ".[dev]"`) kept working. Reading the list directly from pyproject.toml
# keeps this in sync automatically as dependencies are added.
COPY pyproject.toml .
RUN python -c "import tomllib, subprocess; deps = tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']; subprocess.check_call(['pip', 'install', '--no-cache-dir', *deps])"

COPY app/ app/
RUN pip install --no-cache-dir --no-deps .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
