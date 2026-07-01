# cli — 系統總覽與命令列入口

## 角色定位
本文件是整體導覽：定義「從影片到報告」的標準順序、輸出位置與回退策略。  
若與實作衝突，以 `backend/app/cli.py` 與 `backend/app/pipeline.py` 為準。

架構總覽請見 `.opencode/plans/development-plan.md` Section 2、5。

---

## 全流程
1. 讀取影片與可選時間區間（`t0/t1`）。
2. 建立中間幀身分映射（slot + identity db）。
3. 執行 macro（隊形、熱區、互動距離、參與度）。
4. 執行 micro（節奏同步、停止後位移、jerk、軌跡圖）。
5. 合併身分（優先軌跡 ReID，再回退中間幀槽位）。
6. 計算 metrics（紅黃綠燈與關注名單）。
7. 產出教育建議 markdown，可選附加 AI 第五節。
8. 寫入 `tmp/`、`reports/`、`memory/students/`，可選輸出 PDF。

---

## CLI 對齊重點
- 入口：`python -m app.cli <video>`（或 `python -m app <video>`）。
- 常用開關：`--stride`、`--t0/--t1`、`--no-track`、`--pose off|pose|holistic`、`--no-video-reid`、`--learn-identities`、`--no-ai`、`--pdf`、`--no-accumulate-sessions`。

---

## 輸出位置
- 臨時輸出：`tmp/kinder-*.json|.md|.png|.pdf`
- 報告歸檔：`reports/YYYY-MM-DD-kinder-*.md`
- 個別 metrics：`reports/metrics/`
- 身分與跨影片累積：`memory/identity_features.db.json`、`memory/students/`
- 個人長期報告：`reports/students/`

---

## 原則
1. 嚴守去識別化：對外顯示「孩子 N」。
2. 明確標記 fallback：追蹤失敗、MediaPipe 不可用、AI 不可用都要寫 warnings。
3. 報告僅供教學輔助，不替代教師專業判斷。
