import pytest
from unittest.mock import MagicMock, patch
from app.gemini.client import GeminiClient

def test_gemini_client_fallback_direct():
    client = GeminiClient(api_key="")
    data = {
        "course_type": "freeze_dance",
        "rhythm_sync_rate": 0.9,
        "freeze_reaction_time": 1.2,
        "freeze_stability_score": 0.8
    }
    report = client.generate_report(data)
    assert "發展評估報告" in report
    assert "freeze_dance" in report
    assert "0.9" in report
    assert "1.2" in report
    assert "0.8" in report

def test_gemini_client_advice_empty_key():
    client = GeminiClient(api_key="")
    advice = client.generate_educational_advice("{}")
    assert advice == ""

@patch("google.genai.Client")
def test_gemini_client_generate_success(mock_client_class):
    # Mock the genai Client and its generate_content response
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Mocked AI report text"
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client

    client = GeminiClient(api_key="fake-api-key")
    data = {
        "course_type": "march",
        "rhythm_sync_rate": 0.85
    }
    report = client.generate_report(data)
    assert report == "Mocked AI report text"
    mock_client.models.generate_content.assert_called_once()

@patch("google.genai.Client")
def test_gemini_client_advice_success(mock_client_class):
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Mocked educational advice"
    mock_client.models.generate_content.return_value = mock_response
    mock_client_class.return_value = mock_client

    client = GeminiClient(api_key="fake-api-key")
    advice = client.generate_educational_advice("test context")
    assert advice == "Mocked educational advice"
