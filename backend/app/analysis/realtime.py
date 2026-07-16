"""Real-time analysis pipeline for live IMU streaming with music sync."""

from __future__ import annotations

import logging
from collections import deque
from typing import Any

from app.analysis.rhythm import analyze_rhythm_sync
from app.analysis.freeze_dance import analyze_freeze_response

logger = logging.getLogger(__name__)

BUFFER_SIZE = 1500  # 30s @ 50Hz
RHYTHM_INTERVAL = 250  # analyze every 250 frames (~5s)
FREEZE_MIN_GAP = 2.0  # min seconds between freeze analyses for same stop_time


class RealtimeAnalyzer:
    """Stateful analyzer that ingests IMU frames and emits music-synced results."""

    def __init__(self, bpm: float, beat_times: list[float] | None = None,
                 stop_times: list[float] | None = None, music_duration: float = 0.0):
        self.bpm = bpm
        self.beat_times = beat_times or []
        self.stop_times = stop_times or []
        self.music_duration = music_duration

        self._buffer: deque[dict[str, Any]] = deque(maxlen=BUFFER_SIZE)
        self._frame_count = 0
        self._music_start_ts: float | None = None
        self._analyzed_stops: set[float] = set()

    def set_music_start(self, timestamp: float) -> None:
        """Record the real-world timestamp when music playback started."""
        self._music_start_ts = timestamp
        self._analyzed_stops.clear()
        logger.info("Music start timestamp set: %.3f", timestamp)

    def ingest(self, frame: dict[str, Any]) -> dict[str, Any] | None:
        """Ingest one IMU frame. Returns analysis result dict or None.

        Expected frame keys: ts, ax, ay, az, gx, gy, gz
        """
        self._buffer.append(frame)
        self._frame_count += 1

        if self._frame_count % RHYTHM_INTERVAL == 0:
            return self._run_rhythm_analysis()

        # Check if any stop_time was just reached
        if self._music_start_ts is not None and self.stop_times:
            elapsed = frame.get("ts", 0) - self._music_start_ts if self._music_start_ts else 0
            for st in self.stop_times:
                if st not in self._analyzed_stops and abs(elapsed - st) < FREEZE_MIN_GAP:
                    self._analyzed_stops.add(st)
                    return self._run_freeze_analysis(st)

        return None

    def _run_rhythm_analysis(self) -> dict[str, Any]:
        imu_list = list(self._buffer)
        result = analyze_rhythm_sync(imu_list, self.bpm)
        return {"type": "rhythm_update", **result}

    def _run_freeze_analysis(self, stop_time: float) -> dict[str, Any]:
        imu_list = list(self._buffer)
        result = analyze_freeze_response(imu_list, stop_time)
        return {"type": "freeze_update", "stop_time": stop_time, **result}
