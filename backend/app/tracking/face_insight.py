from __future__ import annotations

import numpy as np
import cv2


def embed_face_optional(face_patch: np.ndarray) -> np.ndarray | None:
    if face_patch is None or face_patch.size == 0:
        return None

    try:
        h, w = face_patch.shape[:2]
        if h < 20 or w < 20:
            return None

        gray = cv2.cvtColor(face_patch, cv2.COLOR_BGR2GRAY) if face_patch.shape[-1] == 3 else face_patch
        gray = cv2.resize(gray, (64, 64))

        hog = cv2.HOGDescriptor((64, 64), (16, 16), (8, 8), (8, 8), 9)
        features = hog.compute(gray)
        if features is None or features.size == 0:
            return None

        vec = features.ravel().astype(np.float64)
        norm = np.linalg.norm(vec)
        if norm > 1e-8:
            vec /= norm

        if vec.shape[0] >= 128:
            bins = np.linspace(0, vec.shape[0], 129).astype(int)
            pooled = np.array([np.mean(vec[bins[i]:bins[i+1]]) for i in range(128)])
            return pooled
        return np.pad(vec, (0, 128 - vec.shape[0]), mode="constant")
    except Exception:
        return None
