"""Real-time video analysis pipeline for live camera streaming with YOLO + MediaPipe."""

from __future__ import annotations

import logging
import time
from collections import deque
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from app.analysis.pose.estimator import MediaPipePoseRefiner, try_create_refiner
from app.analysis.pose.common import crop_padded_xyxy

logger = logging.getLogger(__name__)

FRAME_BUFFER_SIZE = 300  # 30s @ 10fps
YOLO_STRIDE = 5  # detect every 5 frames (~2fps at 10fps input)
METRICS_INTERVAL = 30  # compute CV metrics every 30 frames (~3s)
MAX_PERSONS = 10

# ByteTrack-like simple centroid tracker (no external dependency beyond numpy)
class _CentroidTracker:
    """Lightweight centroid tracker for real-time pose tracking."""

    def __init__(self, max_disappear: int = 5, max_distance: float = 80.0):
        self._next_id = 0
        self._objects: dict[int, np.ndarray] = {}  # id -> centroid (x, y)
        self._disappeared: dict[int, int] = {}
        self._max_disappear = max_disappear
        self._max_distance = max_distance

    def update(self, detections: list[np.ndarray]) -> list[dict[str, Any]]:
        """Update tracker with new bounding boxes. Returns list of {track_id, bbox, centroid}."""
        if not detections:
            for oid in list(self._disappeared):
                self._disappeared[oid] += 1
                if self._disappeared[oid] > self._max_disappear:
                    self._deregister(oid)
            return []

        centroids = np.array([[(d[0] + d[2]) / 2, (d[1] + d[3]) / 2] for d in detections])

        if not self._objects:
            return self._register_all(detections, centroids)

        object_ids = list(self._objects.keys())
        object_centroids = np.array(list(self._objects.values()))

        distances = np.linalg.norm(object_centroids[:, None] - centroids[None, :], axis=2)
        rows = distances.min(axis=1).argsort()
        cols = distances.argmin(axis=1)[rows]

        used_rows: set[int] = set()
        used_cols: set[int] = set()
        assignments: list[dict[str, Any]] = []

        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols:
                continue
            if distances[row, col] > self._max_distance:
                continue
            oid = object_ids[row]
            self._objects[oid] = centroids[col]
            self._disappeared[oid] = 0
            used_rows.add(row)
            used_cols.add(col)
            assignments.append({
                "track_id": oid,
                "bbox": detections[col],
                "centroid": centroids[col].tolist(),
            })

        for row in set(range(len(object_ids))) - used_rows:
            oid = object_ids[row]
            self._disappeared[oid] += 1
            if self._disappeared[oid] > self._max_disappear:
                self._deregister(oid)

        for col in set(range(len(detections))) - used_cols:
            self._register(detections[col], centroids[col])

        return assignments

    def _register(self, bbox: np.ndarray, centroid: np.ndarray) -> dict[str, Any]:
        self._objects[self._next_id] = centroid
        self._disappeared[self._next_id] = 0
        tid = self._next_id
        self._next_id += 1
        return {"track_id": tid, "bbox": bbox, "centroid": centroid.tolist()}

    def _register_all(self, detections: list[np.ndarray], centroids: np.ndarray) -> list[dict[str, Any]]:
        results = []
        for det, cent in zip(detections, centroids):
            results.append(self._register(det, cent))
        return results

    def _deregister(self, oid: int) -> None:
        self._objects.pop(oid, None)
        self._disappeared.pop(oid, None)

    @property
    def active_ids(self) -> list[int]:
        return list(self._objects.keys())


def _compute_cv_metrics_from_history(pose_history: deque) -> dict[str, float]:
    """Compute 6 CV metrics from recent pose history.

    Each entry in pose_history is a list of person dicts:
    [{"person_id": int, "bbox": [x1,y1,x2,y2], "keypoints": [[x,y]×17]}]
    """
    if not pose_history:
        return _empty_metrics()

    all_poses = list(pose_history)

    # Engagement: fraction of frames with at least one active person (> 5px movement)
    active_frames = 0
    for frame_poses in all_poses:
        if not frame_poses:
            continue
        for p in frame_poses:
            if p.get("movement", 0) > 5.0:
                active_frames += 1
                break
    engagement = active_frames / max(1, len(all_poses))

    # Formation stability: variance of person centroids across frames
    centroid_series: list[list[tuple[float, float]]] = []
    for frame_poses in all_poses:
        centroid_series.append([(p["centroid"][0], p["centroid"][1]) for p in frame_poses if "centroid" in p])

    if centroid_series and centroid_series[0]:
        n_persons = len(centroid_series[0])
        xs = np.array([[c[i][0] if i < len(c) else 0 for c in centroid_series] for i in range(n_persons)])
        ys = np.array([[c[i][1] if i < len(c) else 0 for c in centroid_series] for i in range(n_persons)])
        x_std = np.mean(np.std(xs, axis=1))
        y_std = np.mean(np.std(ys, axis=1))
        formation_stability = max(0, 1.0 - (x_std + y_std) / 200.0)
    else:
        formation_stability = 0.0

    # Spatial utilization: coverage of 3x3 grid
    grid = np.zeros((3, 3), dtype=float)
    h, w = 480, 640  # assume default frame size
    for frame_poses in all_poses:
        for p in frame_poses:
            if "centroid" in p:
                cx, cy = p["centroid"]
                gx = min(2, int(cx / w * 3))
                gy = min(2, int(cy / h * 3))
                grid[gy, gx] = 1.0
    spatial_utilization = grid.sum() / 9.0

    # Gait symmetry: compare left/right knee-ankle y-displacement variance
    gait_values = []
    for frame_poses in all_poses[-30:]:
        for p in frame_poses:
            kp = p.get("keypoints", [])
            if len(kp) >= 17 and kp[13] and kp[15] and kp[14] and kp[16]:
                left_stride = abs(kp[13][1] - kp[15][1])
                right_stride = abs(kp[14][1] - kp[16][1])
                if left_stride + right_stride > 0:
                    gait_values.append(abs(left_stride - right_stride) / max(left_stride, right_stride))
    gait_symmetry = 1.0 - (np.mean(gait_values) if gait_values else 0.5)

    # Balance sway: area of centroid trajectory (bounding box approximation)
    sway_points = []
    for frame_poses in all_poses[-30:]:
        for p in frame_poses:
            if "centroid" in p:
                sway_points.append(p["centroid"])
    if len(sway_points) >= 3:
        pts = np.array(sway_points)
        x_range = pts[:, 0].max() - pts[:, 0].min()
        y_range = pts[:, 1].max() - pts[:, 1].min()
        area = x_range * y_range
        balance_sway = max(0, 1.0 - area / (w * h * 0.1))
    else:
        balance_sway = 0.5

    # Limb coordination: phase-locking value between upper and lower limb motion
    upper_motion = []
    lower_motion = []
    for frame_poses in all_poses[-30:]:
        for p in frame_poses:
            kp = p.get("keypoints", [])
            if len(kp) >= 17 and kp[9] and kp[10] and kp[15] and kp[16]:
                upper_mag = (abs(kp[9][0] - kp[5][0]) + abs(kp[10][0] - kp[6][0])) / 2
                lower_mag = (abs(kp[15][1] - kp[13][1]) + abs(kp[16][1] - kp[14][1])) / 2
                upper_motion.append(upper_mag)
                lower_motion.append(lower_mag)
    if len(upper_motion) >= 5:
        u = np.array(upper_motion) - np.mean(upper_motion)
        l = np.array(lower_motion) - np.mean(lower_motion)
        denom = np.std(upper_motion) * np.std(lower_motion) * len(upper_motion)
        limb_coordination = abs(np.sum(u * l)) / max(denom, 1e-6)
    else:
        limb_coordination = 0.0

    return {
        "engagement": float(np.clip(engagement, 0, 1)),
        "formation_stability": float(np.clip(formation_stability, 0, 1)),
        "spatial_utilization": float(np.clip(spatial_utilization, 0, 1)),
        "gait_symmetry": float(np.clip(gait_symmetry, 0, 1)),
        "balance_sway": float(np.clip(balance_sway, 0, 1)),
        "limb_coordination": float(np.clip(limb_coordination, 0, 1)),
    }


def _cross(o: tuple, a: tuple, b: tuple, c: tuple) -> float:
    return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])


def _polygon_area(pts: np.ndarray) -> float:
    n = len(pts)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    return abs(area) / 2.0


def _empty_metrics() -> dict[str, float]:
    return {
        "engagement": 0.0,
        "formation_stability": 0.0,
        "spatial_utilization": 0.0,
        "gait_symmetry": 0.0,
        "balance_sway": 0.0,
        "limb_coordination": 0.0,
    }


class RealtimeVideoAnalyzer:
    """Stateful analyzer that ingests camera frames and emits pose + CV results."""

    def __init__(self, yolo_model_path: str = "yolov8n-pose.pt"):
        logger.info("Initializing RealtimeVideoAnalyzer with model: %s", yolo_model_path)
        self._yolo = YOLO(yolo_model_path)
        self._refiner: MediaPipePoseRefiner | None = try_create_refiner()
        self._tracker = _CentroidTracker(max_disappear=5, max_distance=80.0)

        self._frame_buffer: deque = deque(maxlen=FRAME_BUFFER_SIZE)
        self._pose_history: deque = deque(maxlen=FRAME_BUFFER_SIZE)
        self._frame_count = 0
        self._last_frame_time = time.time()
        self._fps = 0.0

    def ingest_frame(self, frame_bgr: np.ndarray) -> dict[str, Any] | None:
        """Ingest one BGR frame. Returns pose_update/cv_update dict or None."""
        self._frame_count += 1
        self._frame_buffer.append(frame_bgr)

        # Compute FPS
        now = time.time()
        dt = now - self._last_frame_time
        self._last_frame_time = now
        if dt > 0:
            self._fps = 0.9 * self._fps + 0.1 * (1.0 / dt)

        if self._frame_count % YOLO_STRIDE != 0:
            return None

        # 1. YOLO detection
        results = self._yolo(frame_bgr, verbose=False, conf=0.35)
        det = results[0]
        bboxes = det.boxes.xyxy.cpu().numpy() if det.boxes is not None and len(det.boxes) else np.zeros((0, 4))
        yolo_keypoints = None
        if det.keypoints is not None and len(det.keypoints) > 0:
            yolo_keypoints = det.keypoints.xy.cpu().numpy()

        # Filter to top MAX_PERSONS by confidence
        if len(bboxes) > MAX_PERSONS and det.boxes is not None:
            confs = det.boxes.conf.cpu().numpy()
            top_idx = np.argsort(confs)[-MAX_PERSONS:]
            bboxes = bboxes[top_idx]
            if yolo_keypoints is not None:
                yolo_keypoints = yolo_keypoints[top_idx]

        # 2. Track
        tracked = self._tracker.update(bboxes.tolist() if len(bboxes) > 0 else [])

        # 3. MediaPipe refinement per person
        frame_h, frame_w = frame_bgr.shape[:2]
        poses = []
        prev_poses = self._pose_history[-1] if self._pose_history else []

        for i, track in enumerate(tracked):
            bbox = np.array(track["bbox"])
            kp_raw = yolo_keypoints[i] if yolo_keypoints is not None and i < len(yolo_keypoints) else None

            # Refine with MediaPipe
            keypoints = None
            if self._refiner is not None and bbox.size >= 4:
                refined = self._refiner.landmarks_coco17_fullframe(frame_bgr, bbox)
                if refined is not None:
                    keypoints = refined.tolist()

            # Fallback to YOLO keypoints
            if keypoints is None and kp_raw is not None:
                keypoints = kp_raw.tolist()

            if keypoints is None:
                # Generate empty keypoints
                keypoints = [[0.0, 0.0]] * 17

            # Compute movement from previous frame
            movement = 0.0
            for pp in prev_poses:
                if pp.get("person_id") == track["track_id"] and "centroid" in pp:
                    prev_c = np.array(pp["centroid"])
                    curr_c = np.array(track["centroid"])
                    movement = float(np.linalg.norm(curr_c - prev_c))
                    break

            # Normalize bbox to [x1, y1, x2, y2] as list
            bbox_list = bbox.tolist() if isinstance(bbox, np.ndarray) else list(bbox)

            poses.append({
                "person_id": track["track_id"],
                "bbox": [float(v) for v in bbox_list],
                "keypoints": keypoints,
                "centroid": track["centroid"],
                "movement": movement,
            })

        self._pose_history.append(poses)

        result: dict[str, Any] = {
            "type": "pose_update",
            "poses": [_sanitize_pose(p, frame_w, frame_h) for p in poses],
            "frame_count": self._frame_count,
            "fps": round(self._fps, 1),
            "person_count": len(poses),
        }

        # 4. Compute CV metrics periodically
        if self._frame_count % METRICS_INTERVAL == 0 and len(self._pose_history) >= 10:
            metrics = _compute_cv_metrics_from_history(self._pose_history)
            result["cv_metrics"] = metrics

        return result


def _sanitize_pose(pose: dict, frame_w: int, frame_h: int) -> dict:
    """Normalize pose data for JSON serialization."""
    return {
        "person_id": pose["person_id"],
        "bbox": [float(v) for v in pose["bbox"]],
        "keypoints": [[float(x), float(y)] for x, y in pose["keypoints"]],
        "movement": float(pose.get("movement", 0)),
    }
