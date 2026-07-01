def test_health():
    from app.main import app
    assert app.title == "HMEAYC AI Engine"


def test_router_count():
    from app.main import app
    assert len(app.routes) >= 4


def test_db_url():
    from app.db.base import DATABASE_URL
    assert "postgresql" in DATABASE_URL
    assert "asyncpg" not in DATABASE_URL


def test_firmware_routes():
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, 'path')]
    assert "/api/firmware/version" in paths
    assert "/api/firmware/upload" in paths
    assert "/api/firmware/download/{fw_id}" in paths
    assert "/api/firmware/list" in paths
    assert "/api/firmware/ack" in paths


def test_analysis_rhythm_returns_dict():
    from app.analysis.rhythm import analyze_rhythm_sync
    result = analyze_rhythm_sync([], 120)
    assert isinstance(result, dict)
    assert "sync_rate" in result
    assert "bpm" in result


def test_analysis_rhythm_with_data():
    from app.analysis.rhythm import analyze_rhythm_sync
    data = [{"ts": i * 0.02, "ax": 1.0, "ay": 0.5, "az": 0.3} for i in range(500)]
    result = analyze_rhythm_sync(data, 120)
    assert isinstance(result["sync_rate"], float)
    assert result["bpm"] == 120


def test_analysis_freeze_returns_dict():
    from app.analysis.freeze_dance import analyze_freeze_response
    result = analyze_freeze_response([], 5.0)
    assert isinstance(result, dict)
    assert "reaction_time" in result
    assert "stability_score" in result


def test_analysis_freeze_with_data():
    from app.analysis.freeze_dance import analyze_freeze_response
    data = [{"ts": i * 0.02, "ax": 1.0, "ay": 0.5, "az": 0.3} for i in range(500)]
    result = analyze_freeze_response(data, 5.0)
    assert isinstance(result["reaction_time"], float)
    assert isinstance(result["stability_score"], float)


def test_face_insight_basic():
    import numpy as np
    from app.tracking.face_insight import embed_face_optional
    assert embed_face_optional(None) is None
    assert embed_face_optional(np.array([], dtype=np.uint8)) is None


def test_face_insight_embedding():
    import numpy as np
    from app.tracking.face_insight import embed_face_optional
    patch = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    fe = embed_face_optional(patch)
    assert fe is not None
    assert fe.shape == (128,)


def test_gemini_client_fallback():
    from app.gemini.client import GeminiClient
    client = GeminiClient(api_key="")
    report = client._fallback_report({"course_type": "march", "rhythm_sync_rate": 0.85})
    assert "發展評估報告" in report
    assert "march" in report
    assert "0.85" in report


def test_all_routes():
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, 'path')]
    required = [
        "/health",
        "/api/sessions",
        "/api/sessions/{session_id}",
        "/api/sessions/{session_id}/analysis",
        "/api/sessions/{session_id}/report",
        "/api/sessions/{session_id}/assignments",
        "/api/sessions/{session_id}/assign",
        "/api/reports/{report_id}",
        "/api/devices",
        "/api/children",
        "/api/firmware/version",
        "/api/firmware/upload",
        "/api/firmware/download/{fw_id}",
        "/api/firmware/list",
        "/api/firmware/ack",
        "/api/analyze/tasks/{task_id}",
        "/ws/{session_id}",
    ]
    for p in required:
        assert p in paths, f"Missing route: {p}"
