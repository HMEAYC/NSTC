"""ArcFace / InsightFace 臉部 embedding（選用依賴）。

目前為 stub：embed_face_optional 回傳 None，系統以外觀 embedding 替代。
待實作：安裝 insightface 後補上真正的 ArcFace 推論。
"""
from __future__ import annotations

import numpy as np


def embed_face_optional(face_patch: np.ndarray) -> np.ndarray | None:
    """回傳 512 維 ArcFace embedding，或 None（InsightFace 不可用時）。"""
    return None
