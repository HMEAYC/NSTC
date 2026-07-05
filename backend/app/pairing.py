import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.fft import fft, fftfreq
from typing import Any
import logging

logger = logging.getLogger(__name__)


def _accel_mag(row: dict[str, Any]) -> float:
    ax = row.get("ax", 0)
    ay = row.get("ay", 0)
    az = row.get("az", 0)
    return float(np.sqrt(ax * ax + ay * ay + az * az))


def _resample(sig: np.ndarray, n: int) -> np.ndarray:
    if len(sig) == n:
        return sig
    return np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(sig)), sig)


def _fft_phase_correlation(a_full: np.ndarray, b_full: np.ndarray) -> float:
    n = min(len(a_full), len(b_full))
    a = _resample(a_full, n)
    b = _resample(b_full, n)
    a -= a.mean()
    b -= b.mean()
    if a.std() < 1e-9 or b.std() < 1e-9:
        return 0.0
    Fa = fft(a)
    Fb = fft(b)
    cross = Fa * np.conj(Fb)
    cross /= np.abs(cross) + 1e-10
    pcorr = np.abs(fft(cross))
    return float(pcorr.max() / n)


def compute_pairing(
    imu_signals: dict[str, list[dict[str, Any]]],
    child_ids: list[str],
    fs: float = 50.0,
    pose_signals: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    device_ids = sorted(imu_signals.keys())
    n_dev = len(device_ids)
    n_child = len(child_ids)

    if n_dev == 0 or n_child == 0:
        return {"assignments": [], "bpm_estimate": 0.0, "pose_data_available": False}

    sigs: dict[str, np.ndarray] = {}
    for dev_id in device_ids:
        rows = sorted(imu_signals[dev_id], key=lambda r: r.get("ts", 0))
        mag = np.asarray([_accel_mag(r) for r in rows])
        sigs[dev_id] = mag if len(mag) >= 10 else np.zeros(10)

    min_len = min(len(s) for s in sigs.values())
    if min_len < 10:
        return {"assignments": [], "bpm_estimate": 0.0, "pose_data_available": False}

    n = min(min_len, 4096)
    has_pose = pose_signals is not None and len(pose_signals) > 0

    if has_pose:
        pose_ids = [k for k in child_ids if k in pose_signals]
        if len(pose_ids) == 0:
            has_pose = False

    if has_pose:
        cost = np.ones((n_dev, n_child)) * 0.5
        for i, dev_id in enumerate(device_ids):
            si = _resample(sigs[dev_id][:n], n)
            for j, ch_id in enumerate(child_ids):
                hip = pose_signals.get(ch_id)
                if hip is not None and len(hip) >= 10:
                    pj = _resample(np.asarray(hip), n)
                    cost[i, j] = 1.0 - _fft_phase_correlation(si, pj)
                else:
                    cost[i, j] = 0.5

        row_ind, col_ind = linear_sum_assignment(cost)

        result = []
        for i, j in zip(row_ind, col_ind):
            conf = round(float(max(0.0, min(1.0, 1.0 - cost[i, j]))), 4)
            result.append({
                "device_id": device_ids[i],
                "child_id": child_ids[j],
                "confidence": conf,
                "method": "fft_phase_cross_modal",
            })
        return {"assignments": result, "bpm_estimate": 0.0, "pose_data_available": True}

    device_analyses = []
    for dev_id in device_ids:
        sig = sigs[dev_id]
        x = sig[:n] if len(sig) >= n else np.pad(sig, (0, n - len(sig)))
        x -= x.mean()
        if x.std() < 1e-9:
            device_analyses.append({"device_id": dev_id, "error": "signal too flat"})
            continue
        Fa = fft(x)
        freqs = fftfreq(n, d=1.0 / fs)
        mag = np.abs(Fa[: n // 2])
        peak = int(np.argmax(mag))
        dom_freq = float(freqs[peak])
        phase = float(np.angle(Fa[peak]))
        energy = float(np.sum(mag))
        snr = float(mag[peak] / (np.mean(mag) + 1e-10))
        device_analyses.append({
            "device_id": dev_id,
            "dominant_freq_hz": round(dom_freq, 3),
            "bpm": round(dom_freq * 60.0, 1),
            "phase_rad": round(phase, 3),
            "snr": round(snr, 2),
            "energy": round(energy, 2),
        })

    bpms = [d["bpm"] for d in device_analyses if "bpm" in d]
    bpm_est = float(np.mean(bpms)) if bpms else 0.0

    sorted_devs = sorted(device_analyses, key=lambda d: d.get("phase_rad", 0))
    assignments = []
    for idx, da in enumerate(sorted_devs):
        child_id = child_ids[idx % n_child]
        conf = round(min(1.0, da.get("snr", 1) / 10.0), 4)
        assignments.append({
            "device_id": da["device_id"],
            "child_id": child_id,
            "confidence": conf,
            "method": "fft_phase_imu_only",
            "dominant_freq_hz": da.get("dominant_freq_hz", 0),
            "phase_rad": da.get("phase_rad", 0),
        })

    return {
        "assignments": assignments,
        "bpm_estimate": round(bpm_est, 1),
        "pose_data_available": False,
        "device_analyses": device_analyses,
    }
