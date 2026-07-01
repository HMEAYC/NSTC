"""
Gemini API client for generating child development reports.
"""

from google import genai
from app.gemini.prompts import REPORT_PROMPT_TEMPLATE


class GeminiClient:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key) if api_key else None

    async def generate_report(self, analysis_data: dict) -> str:
        if not self.client:
            return self._fallback_report(analysis_data)

        prompt = REPORT_PROMPT_TEMPLATE.format(
            course_type=analysis_data.get("course_type", "unknown"),
            rhythm_sync_rate=analysis_data.get("rhythm_sync_rate", "N/A"),
            freeze_reaction_time=analysis_data.get("freeze_reaction_time", "N/A"),
            freeze_stability_score=analysis_data.get("freeze_stability_score", "N/A"),
        )

        try:
            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )
            return response.text if response and response.text else self._fallback_report(analysis_data)
        except Exception:
            return self._fallback_report(analysis_data)

    def _fallback_report(self, data: dict) -> str:
        return f"""# 幼兒發展評估報告

## 課程類型
{data.get('course_type', '一般課程')}

## 節奏同步分析
節奏同步率：{data.get('rhythm_sync_rate', 'N/A')}

## Freeze Dance 分析
反應時間：{data.get('freeze_reaction_time', 'N/A')} 秒
穩定度分數：{data.get('freeze_stability_score', 'N/A')}

## 總結
此報告由 HMEAYC 系統自動生成。
"""
