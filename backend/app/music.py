"""Music analysis utilities: extract BPM, beat times, and stop times from audio files."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# In-memory cache: file_hash -> analysis result
_analysis_cache: dict[str, dict] = {}
_CACHE_MAX_SIZE = 50


def _file_hash(file_path: str | Path) -> str:
    """Compute a fast hash of the file (first 64KB + size)."""
    p = Path(file_path)
    size = p.stat().st_size
    with open(p, "rb") as f:
        head = f.read(65536)
    return hashlib.sha256(head + str(size).encode()).hexdigest()[:16]


def analyze_music(file_path: str | Path) -> dict:
    """Analyze a music file and return BPM, beat times, and stop times.

    Results are cached by file hash to avoid re-analysis of the same file.

    Args:
        file_path: Path to an audio file (mp3, wav, m4a, etc.).

    Returns:
        dict with keys: bpm, beat_times, stop_times, duration.
    """
    fh = _file_hash(file_path)
    if fh in _analysis_cache:
        logger.info("Music analysis cache hit for %s", fh)
        return _analysis_cache[fh]

    y, sr = librosa.load(str(file_path), sr=22050, mono=True)

    # BPM + beat onset detection
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = [round(float(t), 3) for t in beat_frames]

    # Stop detection: RMS energy sudden drop (> 35% below median)
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    median_rms = float(np.median(rms))
    threshold = median_rms * 0.65
    stop_times: list[float] = []
    for i in range(1, len(rms)):
        if rms[i - 1] > median_rms and rms[i] < threshold:
            stop_times.append(round(float(times[i]), 3))

    duration = round(float(len(y) / sr), 2)

    result = {
        "bpm": round(bpm, 1),
        "beat_times": beat_times,
        "stop_times": stop_times,
        "duration": duration,
    }

    # Cache the result
    if len(_analysis_cache) >= _CACHE_MAX_SIZE:
        # Remove oldest entry
        _analysis_cache.pop(next(iter(_analysis_cache)))
    _analysis_cache[fh] = result

    logger.info(
        "Music analysis: bpm=%.1f, beats=%d, stops=%d, duration=%.1fs (hash=%s)",
        bpm, len(beat_times), len(stop_times), duration, fh,
    )

    return result


def compute_beat_times_from_bpm(bpm: float, duration: float) -> list[float]:
    """Generate evenly-spaced beat times from BPM and duration (fallback when no audio)."""
    if bpm <= 0:
        return []
    interval = 60.0 / bpm
    times = []
    t = interval  # skip the very first beat at t=0
    while t < duration:
        times.append(round(t, 3))
        t += interval
    return times
