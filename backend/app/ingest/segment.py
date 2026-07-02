from __future__ import annotations

import subprocess
from pathlib import Path


def export_video_segment(
    input_path: str | Path,
    t0_sec: float,
    t1_sec: float,
    output_path: str | Path,
) -> Path:
    """Trim a video segment using ffmpeg (fast seek, copy codecs)."""
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.0, t1_sec - t0_sec)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", f"{t0_sec:.3f}",
        "-i", str(input_path),
        "-t", f"{duration:.3f}",
        "-c", "copy",
        "-avoid_negative_ts", "1",
        str(out),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out
