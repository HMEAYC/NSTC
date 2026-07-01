# pipeline — 核心調度

## 角色定位
負責啟動並串接完整分析管線。

詳細流程說明請見 `.opencode/plans/development-plan.md` Section 5.3。

---

## 實際流程

### Step 1: 影片與區間處理
- 讀取影片 meta（fps、frame_count、duration）。
- 若提供 `t0/t1`，先用 `ffmpeg` 匯出片段。

### Step 2: 中間幀身分映射（slot map）
- 使用 YOLO 在影片中間幀偵測人框，按 x 座標由左到右排序成槽位。
- 優先嘗試 ArcFace（若可用），否則用外觀 embedding。

### Step 3: 巨觀分析（Macro）
- 產出 `tmp/kinder-macro-result.json` 與 `tmp/kinder-heatmap.png`。

### Step 4: 微觀分析（Micro）
- 預設使用 ByteTrack；無法穩定追蹤時回退「槽位對齊」。
- 可選姿勢後端：`off | pose | holistic`。

### Step 5: 身分合併與名稱正規化
- 先採用 `micro.reid_by_track`；缺失時回退中間幀槽位映射。
- 對外顯示名稱統一轉成「孩子 N」。

### Step 6: 指標核查與教育建議
- `metrics_checker.run_metrics(macro, micro)` → `tmp/kinder-metrics-check.json`。
- `edu_advisor.render_edu_markdown(...)` → `tmp/kinder-report.md`。

### Step 7: 歸檔與可選 PDF

---

## 主要輸出檔
- `tmp/kinder-identity-map.json`、`tmp/kinder-macro-result.json`
- `tmp/kinder-micro-result.json`、`tmp/kinder-metrics-check.json`
- `tmp/kinder-report.md`、`reports/YYYY-MM-DD-kinder-report.md`

---

## 限制與原則
- 僅為教學輔助，不替代教師判斷。
- 對外使用去識別稱呼（孩子 N）。
