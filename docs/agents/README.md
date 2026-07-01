# Agent / 維護者說明

與程式對齊的說明文件皆在此目錄。架構總覽請見 `.opencode/plans/development-plan.md`。

| 檔案 | 對應程式 |
|------|-----------|
| `cli.md` | `backend/app/cli.py`（系統總覽與 CLI） |
| `pipeline.md` | `backend/app/pipeline.py` |
| `macro_analytics.md` | `backend/app/analysis/macro.py` |
| `micro_analytics.md` | `backend/app/analysis/micro.py` |
| `metrics_checker.md` | `backend/app/analysis/metrics.py` |
| `edu_advisor.md` | `backend/app/report/advisor.py`、`backend/app/report/ai_edu.py` |
| `identity.md` | `backend/app/tracking/identity.py`（含 pipeline / micro 中的 ReID 流程） |
