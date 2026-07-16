"""
Freeze Dance analysis module.
Detects reaction time and body stability when music stops.
"""

import numpy as np

from app.analysis.imu_utils import calculate_motion_energy


def analyze_freeze_response(imu_data: list[dict], music_stop_time: float) -> dict:
    if not imu_data:
        return {"reaction_time": 0.0, "stability_score": 0.0}

    timestamps = np.array([d.get("ts", i) for i, d in enumerate(imu_data)])
    motion = np.array([
        calculate_motion_energy(d.get("ax", 0), d.get("ay", 0), d.get("az", 0))
        for d in imu_data
    ])

    stop_idx = int(np.searchsorted(timestamps, music_stop_time))
    if stop_idx >= len(timestamps):
        return {"reaction_time": 0.0, "stability_score": 0.0}

    pre_stop = motion[max(0, stop_idx - 50):stop_idx]
    if len(pre_stop) == 0:
        return {"reaction_time": 0.0, "stability_score": 0.0}

    pre_mean = float(np.mean(pre_stop))
    freeze_threshold = pre_mean * 0.5

    reaction_time = 0.0
    for i in range(stop_idx, min(stop_idx + 200, len(motion))):
        if motion[i] < freeze_threshold:
            reaction_time = timestamps[i] - music_stop_time
            break

    freeze_start = stop_idx + int(max(0, reaction_time * 50))
    freeze_end = min(freeze_start + 250, len(motion))
    freeze_segment = motion[freeze_start:freeze_end]

    if len(freeze_segment) < 5:
        stability_score = 1.0
    else:
        cv = float(np.std(freeze_segment) / (np.mean(freeze_segment) + 1e-8))
        stability_score = round(max(0.0, min(1.0, 1.0 - cv)), 4)

    return {
        "reaction_time": round(reaction_time, 3),
        "stability_score": stability_score,
    }
