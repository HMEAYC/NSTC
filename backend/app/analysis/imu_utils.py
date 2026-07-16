"""Shared IMU analysis utilities used by rhythm, freeze_dance, and micro modules."""

from __future__ import annotations

import numpy as np


def calculate_motion_energy(ax: float, ay: float, az: float) -> float:
    """Magnitude of 3-axis acceleration vector."""
    return float(np.sqrt(ax * ax + ay * ay + az * az))


def find_peaks(signal: np.ndarray, threshold: float) -> list[int]:
    """Return indices of local maxima above threshold."""
    if len(signal) < 3:
        return []
    peaks = []
    for i in range(1, len(signal) - 1):
        if signal[i] > signal[i - 1] and signal[i] >= signal[i + 1] and signal[i] > threshold:
            peaks.append(i)
    return peaks
