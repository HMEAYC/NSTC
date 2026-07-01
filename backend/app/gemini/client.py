"""
Gemini API client for generating child development reports.
"""

from google import genai


class GeminiClient:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)

    async def generate_report(self, analysis_data: dict) -> str:
        # TODO: implement report generation with prompt template
        return ""
