"""Face embedding module — ArcFace (InsightFace) with HOG fallback.

Primary: InsightFace ArcFace R100 → 512-dim L2-normalized embedding.
Fallback: OpenCV HOG → 128-dim L2-normalized embedding (used when InsightFace unavailable).
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# --- ArcFace (primary) ---
_arcface_model = None
_arcface_available = False
_arcface_dim = 512

try:
    from insightface.app import FaceAnalysis as _FaceAnalysis

    _arcface_model = _FaceAnalysis(
        name="buffalo_l",
        providers=["CPUExecutionProvider"],
        allowed_modules=["detection", "recognition"],
    )
    _arcface_model.prepare(ctx_id=0, det_size=(640, 640))
    _arcface_available = True
    logger.info("InsightFace ArcFace loaded successfully (dim=%d)", _arcface_dim)
except Exception as exc:
    logger.warning("InsightFace unavailable, falling back to HOG: %s", exc)
    _arcface_model = None

# --- HOG fallback ---
_HOG_DIM = 128


def _hog_embedding(face_patch: np.ndarray) -> np.ndarray | None:
    """Compute 128-dim HOG embedding as fallback."""
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
        if vec.shape[0] >= _HOG_DIM:
            bins = np.linspace(0, vec.shape[0], _HOG_DIM + 1).astype(int)
            pooled = np.array([np.mean(vec[bins[i]:bins[i + 1]]) for i in range(_HOG_DIM)])
            return pooled
        return np.pad(vec, (0, _HOG_DIM - vec.shape[0]), mode="constant")
    except Exception:
        return None


def embed_face_optional(face_patch: np.ndarray) -> np.ndarray | None:
    """Embed a face patch into a L2-normalized vector.

    Returns 512-dim (ArcFace) or 128-dim (HOG fallback) embedding, or None on failure.
    """
    if face_patch is None or face_patch.size == 0:
        return None

    h, w = face_patch.shape[:2]
    if h < 20 or w < 20:
        return None

    # Try ArcFace first
    if _arcface_available and _arcface_model is not None:
        try:
            # InsightFace expects RGB 112x112
            rgb = cv2.cvtColor(face_patch, cv2.COLOR_BGR2RGB) if face_patch.shape[-1] == 3 else face_patch
            resized = cv2.resize(rgb, (112, 112))
            faces = _arcface_model.get(resized)
            if faces:
                # Pick the face with highest detection score
                best = max(faces, key=lambda f: f.det_score)
                emb = best.normed_embedding
                if emb is not None and emb.size == _arcface_dim:
                    return emb.astype(np.float64)
        except Exception:
            pass  # Fall through to HOG

    return _hog_embedding(face_patch)


def embedding_dim() -> int:
    """Return the current embedding dimension."""
    return _arcface_dim if _arcface_available else _HOG_DIM


def is_arcface_available() -> bool:
    """Return whether ArcFace is loaded."""
    return _arcface_available
