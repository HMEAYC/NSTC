# Agent 文件反向索引（`src/**/*.py` → `docs/agents/*.md`）

這份文件提供「程式檔 -> 最可能對應的說明」之反向索引，方便維護時快速判斷應參考哪份 `docs/agents/*.md`。

關聯度標記：
- `高`：主要責任，功能與該文件核心範圍直接對應。
- `中`：次要關聯，常被同一流程調用或依賴。
- `低`：間接關聯，僅提供共用基礎能力或包裝層。

## Core / Orchestration

- `src/__main__.py`
  - `高` `docs/agents/pipeline.md`
  - `中` `docs/agents/cli.md`
- `src/cli.py`
  - `高` `docs/agents/pipeline.md`
  - `中` `docs/agents/cli.md`
- `src/pipeline.py`
  - `高` `docs/agents/pipeline.md`
  - `高` `docs/agents/cli.md`
- `src/ingest/video.py`
  - `高` `docs/agents/pipeline.md`
- `src/timecode.py`
  - `中` `docs/agents/pipeline.md`
- `src/paths.py`
  - `中` `docs/agents/pipeline.md`
  - `中` `docs/agents/identity.md`

## Analysis — Macro（隊形 / 空間）

- `src/analysis/macro.py`
  - `高` `docs/agents/macro_analytics.md`
  - `中` `docs/agents/cli.md`
- `src/dashboard/viz.py`
  - `中` `docs/agents/macro_analytics.md`
  - `中` `docs/agents/micro_analytics.md`

## Analysis — Micro（節奏 / Freeze Dance）

- `src/analysis/micro.py`
  - `高` `docs/agents/micro_analytics.md`
  - `中` `docs/agents/cli.md`
- `src/analysis/pose/estimator.py`
  - `高` `docs/agents/micro_analytics.md`
- `src/analysis/pose/holistic.py`
  - `高` `docs/agents/micro_analytics.md`
- `src/analysis/pose/common.py`
  - `中` `docs/agents/micro_analytics.md`

## Tracking — Identity / ReID

- `src/tracking/identity.py`
  - `高` `docs/agents/identity.md`
  - `中` `docs/agents/pipeline.md`
- `src/face_insight.py`  *(待補)*
  - `高` `docs/agents/identity.md`

## Tracking — Longitudinal

- `src/tracking/longitudinal.py`
  - `中` `docs/agents/metrics_checker.md`
  - `中` `docs/agents/identity.md`
- `src/tracking/importer.py`
  - `中` `docs/agents/metrics_checker.md`

## Analysis — Metrics / Validation

- `src/analysis/metrics.py`
  - `高` `docs/agents/metrics_checker.md`
  - `中` `docs/agents/cli.md`

## Report — Gemini / Education

- `src/report/advisor.py`
  - `高` `docs/agents/edu_advisor.md`
  - `中` `docs/agents/cli.md`
- `src/report/ai_edu.py`
  - `高` `docs/agents/edu_advisor.md`
- `src/report/student.py`
  - `中` `docs/agents/edu_advisor.md`
- `src/report/pdf.py`
  - `中` `docs/agents/edu_advisor.md`

## Dashboard

- `src/dashboard/api.py`
  - `中` `docs/agents/pipeline.md`
- `src/dashboard/viz.py`
  - `中` `docs/agents/macro_analytics.md`

## Package Metadata

- `src/__init__.py`
  - `低` `docs/agents/cli.md`

---

## Maintenance Rule (Recommended)

當你修改某個 `src/**/*.py` 時，若該檔案對應的 `docs/agents/*.md` 有描述流程、輸出格式或限制，建議同步檢查該 Markdown 是否需要更新，以避免「程式已改、說明未對齊」。
