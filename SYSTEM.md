# Kinder Vision System — 幼兒行為分析系統

基於論文《解碼教室裡的舞蹈：AI 如何看懂孩子的肢體學習語言》設計的 AI 輔助幼兒音樂教育分析系統。

---

## 系統架構

```
用戶輸入影片
       │
       ▼
┌──────────────────────┐
│      pipeline        │  ← 任務調度（src/pipeline.py）
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│    tracking/identity     │  ← 身分管理與 ReID 歸戶（src/tracking/identity.py）
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│    analysis/macro        │  ← 巨觀層分析（src/analysis/macro.py）
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│    analysis/micro        │  ← 微觀層分析（src/analysis/micro.py）
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│    analysis/metrics      │  ← 指標核查（src/analysis/metrics.py）
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│    report/advisor        │  ← 教育建議（src/report/advisor.py、ai_edu.py）
└──────────────────────────┘
           │
           ▼
        完整報告
```

---

## 模組總覽（說明見 `docs/agents/*.md`）

| Python 模組 | 定位 | 輸入 | 輸出 |
|-----------|------|------|------|
| `src/pipeline.py` | 任務中樞 | 影片檔案 | 完整分析流程調度 |
| `src/ingest/video.py` | 影片讀取 | 影片檔案 | VideoMeta、音訊 |
| `src/tracking/identity.py` | 身分管理員 | 影片 + 特徵資料庫 | 幼兒 ID 歸戶與 ReID 補償 |
| `src/tracking/longitudinal.py` | 長期追蹤 | 多期 session | 跨影片累積指標 |
| `src/analysis/macro.py` | 巨觀觀察員 | 影片檔案 | 隊形/熱區/空間使用報告 |
| `src/analysis/micro.py` | 微觀觀察員 | 影片 + 歸戶 ID | 同步度/穩定度/流暢度報告 |
| `src/analysis/metrics.py` | 品質把關者 | 多期分析數據 | 紅黃綠燈與成長趨勢核查 |
| `src/analysis/pose/` | 姿勢精化層 | 影格 + 人框 | COCO17 關鍵點 |
| `src/report/advisor.py`（含 `ai_edu`） | 教育翻譯官 | 歷史數據集 | 個案成長報告、家長聯絡簿 |
| `src/report/pdf.py` | PDF 匯出 | Markdown | PDF 報告 |
| `src/dashboard/api.py` | REST API | HTTP 請求 | 分析任務管理 |
| `src/dashboard/viz.py` | 視覺化 | 分析結果 | 圖表輸出 |

---

## 核心演進：個案長期追蹤 (Longitudinal Tracking)

系統不僅分析單次行為，更透過「人像資料庫」將數據轉化為成長軌跡：
- **指標 A：Jerk 成長曲線** — 追蹤幼兒在不同週次下動作流暢度的改善情況。
- **指標 B：抑制控制改善率** — 量化幼兒在面對停止信號時位移距離 (cm) 的遞減趨勢。
- **指標 C：空間探索擴張度** — 分析內向或邊緣活動幼兒是否逐漸走向教室中央。

---

## 技術棧 (Technology Stack)

| 姿勢偵測 | YOLOv8-Pose, MediaPipe Holistic |
| 身分識別 | InsightFace, ArcFace (ReID & Edge Recovery) |
| 多目標追蹤 | ByteTrack + Spatio-Temporal Recovery |
| 音訊分析 | librosa (BPM 與靜音偵測) |
| 報告生成 | AI-Enhanced (溫暖語言生成引擎) |


---

## 隱私與安全原則 (Privacy by Design)

1. **去識別化儲存**：資料庫僅儲存 512 維特徵向量，**嚴禁儲存幼兒原始照片**。
2. **本地處理**：身分識別與特徵提取優先在邊緣端 (Edge) 完成。
3. **個案授權**：所有具名報告需經家長與教師雙重授權後方可生成。

---

*最後更新：2026-05-05 (技術藍圖 v2.1 升級)*