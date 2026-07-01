"""
Rhythm analysis module using IMU motion energy.
Detects motion peaks and compares against expected beat intervals.
"""

import numpy as np
from scipy.signal import savgol_filter


def calculate_motion_energy(ax: float, ay: float, az: float) -> float:
    return float(np.sqrt(ax * ax + ay * ay + az * az))


def _find_peaks(signal: np.ndarray, threshold: float) -> list[int]:
    if len(signal) < 3:
        return []
    peaks = []
    for i in range(1, len(signal) - 1):
        if signal[i] > signal[i - 1] and signal[i] >= signal[i + 1] and signal[i] > threshold:
            peaks.append(i)
    return peaks


def analyze_rhythm_sync(imu_data: list[dict], bpm: float) -> dict:
    if not imu_data or bpm <= 0:
        return {"sync_rate": 0.0, "bpm": bpm, "peak_count": 0, "beat_count": 0}

    motion = np.array([
        calculate_motion_energy(d.get("ax", 0), d.get("ay", 0), d.get("az", 0))
        for d in imu_data
    ], dtype=np.float64)

    if len(motion) < 10:
        return {"sync_rate": 0.0, "bpm": bpm, "peak_count": 0, "beat_count": 0}

    motion_smooth = savgol_filter(motion, min(11, len(motion) | 1), 2)

    threshold = float(np.mean(motion_smooth) + 0.5 * np.std(motion_smooth))
    peak_indices = _find_peaks(motion_smooth, threshold)

    if not peak_indices:
        return {"sync_rate": 0.0, "bpm": bpm, "peak_count": 0, "beat_count": 0}

    timestamps = np.array([d.get("ts", i) for i, d in enumerate(imu_data)])
    if timestamps[-1] == timestamps[0]:
        return {"sync_rate": 0.0, "bpm": bpm, "peak_count": 0, "beat_count": 0}

    duration = timestamps[-1] - timestamps[0]
    beat_interval = 60.0 / bpm
    expected_beats = int(duration / beat_interval)

    beat_times = np.array([timestamps[0] + i * beat_interval for i in range(expected_beats)])
    peak_times = timestamps[peak_indices]

    tolerance = beat_interval * 0.25
    sync_count = 0
    for bt in beat_times:
        if np.any(np.abs(peak_times - bt) <= tolerance):
            sync_count += 1

    sync_rate = sync_count / expected_beats if expected_beats > 0 else 0.0

    return {
        "sync_rate": round(sync_rate, 4),
        "bpm": bpm,
        "peak_count": len(peak_indices),
        "beat_count": expected_beats,
    }
