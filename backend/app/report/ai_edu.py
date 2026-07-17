from __future__ import annotations

import json
from typing import Any

from app.config import settings


def _trim(obj: Any, max_chars: int) -> str:
    s = json.dumps(obj, ensure_ascii=False, indent=2)
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 20] + "\n…(truncated)…"


def augment_edu_report(
    base_markdown: str,
    *,
    video_path: str,
    duration_sec: float,
    macro: dict[str, Any],
    micro: dict[str, Any],
    metrics: dict[str, Any],
) -> tuple[str, list[str], bool]:
    warnings: list[str] = []

    ctx = (
        f"影片路徑: {video_path}\n片長秒: {duration_sec:.1f}\n\n"
        "macro:\n"
        + _trim(macro, 12000)
        + "\n\nmicro:\n"
        + _trim(micro, 12000)
        + "\n\nmetrics:\n"
        + _trim(metrics, 8000)
    )

    # 1. 優先採用 Gemini
    if settings.gemini_api_key and str(settings.gemini_api_key).strip():
        from app.gemini.client import GeminiClient
        try:
            client = GeminiClient(api_key=settings.gemini_api_key.strip())
            choice = client.generate_educational_advice(ctx)
            if choice and str(choice).strip():
                block = (
                    "\n\n---\n\n## 五、AI 教學補充建議\n\n"
                    + str(choice).strip()
                    + "\n\n*本段由 AI 依量化摘要生成，僅供參考。*\n"
                )
                return base_markdown.rstrip() + block, warnings, True
            else:
                warnings.append("Gemini 回傳空白，略過附加段落")
        except Exception as e:
            warnings.append(f"Gemini 呼叫失敗，將嘗試 OpenAI 備援：{e!s}")

    # 2. 備援使用 OpenAI / GPT
    key = settings.kinder_ai_api_key or settings.openai_api_key
    if not key or not str(key).strip():
        return base_markdown, warnings, False

    try:
        from openai import OpenAI
    except ImportError:
        warnings.append("已設定 API Key 但未安裝 openai；略過 AI（pip install -r requirements-ai.txt）")
        return base_markdown, warnings, False

    base_url = settings.kinder_ai_base_url.rstrip("/")
    model = settings.kinder_ai_model
    client = OpenAI(api_key=key.strip(), base_url=base_url)
    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.4,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是幼教現場顧問，依據下列機讀量化結果，用繁體中文撰寫簡短教學建議。"
                        "避免醫療診斷或標籤化；語氣專業、具體、可執行。"
                        "輸出為 Markdown，勿重複報告前文；以條列為主，總長約 400–900 字。"
                    ),
                },
                {
                    "role": "user",
                    "content": "以下為本支影片的分析摘要 JSON，請產出可插入教育報告的補充段落：\n\n" + ctx,
                },
            ],
        )
        choice = resp.choices[0].message.content if resp.choices else None
        if not choice or not str(choice).strip():
            warnings.append("AI 回傳空白，略過附加段落")
            return base_markdown, warnings, False
        block = (
            "\n\n---\n\n## 五、AI 教學補充建議\n\n"
            + str(choice).strip()
            + "\n\n*本段由 AI 依量化摘要生成，僅供參考。*\n"
        )
        return base_markdown.rstrip() + block, warnings, True
    except Exception as e:
        warnings.append(f"AI 呼叫失敗（略過）：{e!s}")
        return base_markdown, warnings, False
