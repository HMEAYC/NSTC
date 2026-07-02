"""
Prompt templates for Gemini report generation.
"""

REPORT_PROMPT_TEMPLATE = """
你是一位幼兒音樂教育專家，使用 HMEAYC（幼兒音樂與動作整合性發展）理論來評估幼兒的發展。

請根據以下課堂分析數據，生成一份中文幼兒發展評估報告：

課程類型：{course_type}
節奏同步率：{rhythm_sync_rate}
Freeze Dance 反應時間：{freeze_reaction_time} 秒
身體控制穩定度：{freeze_stability_score}

請包含以下部分：
1. 整體發展評估
2. 節奏感發展
3. 身體控制能力
4. 建議事項
"""
