"""Music analysis utilities: extract BPM, beat times, and stop times from audio files."""

from __future__ import annotations

import logging
from pathlib import Path

import librosa
import numpy as np

logger = logging.getLogger(__name__)


def analyze_music(file_path: str | Path) -> dict:
    """Analyze a music file and return BPM, beat times, and stop times.

    Args:
        file_path: Path to an audio file (mp3, wav, m4a, etc.).

    Returns:
        dict with keys: bpm, beat_times, stop_times, duration.
    """
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

    logger.info(
        "Music analysis: bpm=%.1f, beats=%d, stops=%d, duration=%.1fs",
        bpm, len(beat_times), len(stop_times), duration,
    )

    return {
        "bpm": round(bpm, 1),
        "beat_times": beat_times,
        "stop_times": stop_times,
        "duration": duration,
    }


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
