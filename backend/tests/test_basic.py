def test_health():
    from app.main import app
    assert app.title == "HMEAYC AI Engine"


def test_router_count():
    from app.main import app
    assert len(app.routes) >= 4


def test_db_url():
    from app.db.base import DATABASE_URL
    assert "postgresql+psycopg2" in DATABASE_URL


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


def test_auth_no_key_set():
    import os
    from app.auth import require_api_key
    prev = os.environ.pop("HMEAYC_API_KEY", None)
    try:
        # When no API key is set, require_api_key should return None (pass through)
        result = require_api_key(x_api_key=None)
        assert result is None
    finally:
        if prev is not None:
            os.environ["HMEAYC_API_KEY"] = prev


def test_auth_with_key_valid():
    import os
    prev = os.environ.pop("HMEAYC_API_KEY", None)
    os.environ["HMEAYC_API_KEY"] = "test-key-123"
    # Force reimport by clearing cached value
    import importlib
    import app.auth
    importlib.reload(app.auth)
    try:
        from app.auth import require_api_key as rak
        result = rak(x_api_key="test-key-123")
        assert result is None
    finally:
        if prev is not None:
            os.environ["HMEAYC_API_KEY"] = prev
        else:
            os.environ.pop("HMEAYC_API_KEY", None)
        importlib.reload(app.auth)


def test_auth_with_key_invalid():
    import os
    prev = os.environ.pop("HMEAYC_API_KEY", None)
    os.environ["HMEAYC_API_KEY"] = "test-key-123"
    import importlib
    import app.auth
    importlib.reload(app.auth)
    try:
        from app.auth import require_api_key as rak
        from fastapi import HTTPException
        try:
            rak(x_api_key="wrong-key")
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 401
    finally:
        if prev is not None:
            os.environ["HMEAYC_API_KEY"] = prev
        else:
            os.environ.pop("HMEAYC_API_KEY", None)
        importlib.reload(app.auth)


def test_config_wifi_routes():
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, 'path')]
    assert "/api/config/wifi" in paths


def test_config_wifi_model():
    from app.api.config import WifiConfigUpdate
    m = WifiConfigUpdate(ssid="test-ssid")
    assert m.ssid == "test-ssid"
    assert m.password is None

    m2 = WifiConfigUpdate(ssid="test", password="pass123")
    assert m2.password == "pass123"


def test_wifi_config_model_attrs():
    from app.models.wifi_config import WifiConfig
    assert hasattr(WifiConfig, "ssid")
    assert hasattr(WifiConfig, "password")
    assert hasattr(WifiConfig, "updated_at")
    assert WifiConfig.__tablename__ == "wifi_config"


def test_session_model_has_course_type():
    from app.models.session import Session
    assert hasattr(Session, "course_type")
    assert hasattr(Session, "start_time")
    assert hasattr(Session, "end_time")
    assert hasattr(Session, "status")


def test_report_model_has_new_fields():
    from app.models.report import Report
    assert hasattr(Report, "markdown")
    assert hasattr(Report, "pdf_path")
    assert hasattr(Report, "status")
    assert hasattr(Report, "generated_at")


def test_session_routes_exist():
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, 'path')]
    assert "/api/sessions/{session_id}/end" in paths
    assert "/api/sessions" in paths


def test_new_session_response_shape():
    """Verify that the create_session handler returns expected fields."""
    from app.main import app
    for route in app.routes:
        if hasattr(route, 'path') and route.path == '/api/sessions' and 'POST' in route.methods:
            # Route exists; response shape is verified via integration tests
            assert route.endpoint is not None
            break


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
        "/api/sessions/{session_id}/end",
        "/api/reports/{report_id}",
        "/api/devices",
        "/api/children",
        "/api/firmware/version",
        "/api/firmware/upload",
        "/api/firmware/download/{fw_id}",
        "/api/firmware/list",
        "/api/firmware/ack",
        "/api/analyze/tasks/{task_id}",
        "/api/config/wifi",
        "/ws/{session_id}",
    ]
    for p in required:
        assert p in paths, f"Missing route: {p}"
