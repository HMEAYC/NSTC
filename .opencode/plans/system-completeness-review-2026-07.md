# 系統完成度與風險稽核（2026-07-15）

> 在文件一致性稽核（見 `doc-consistency-audit-2026-07.md`）之後，進一步檢視程式碼本身（backend/firmware/dashboard）找出尚未完成或需要改善的地方。程式碼本身乾淨（無 TODO/FIXME/stub 標記），MVP 五項核心功能（IMU 收集、節奏分析、Freeze Dance、Dashboard、Gemini 報告）邏輯都已真的實作，非空殼。
>
> **更新 1**：修正期間發現 repo 有另一組並行的開發工作（`opencode` session，commit 記錄從 `f9be979` 到 `0dc8b34`，另有數個尚未 commit 的修正），已完成即時音樂整合、即時攝影機管線（YOLO+MediaPipe）、ArcFace 人臉辨識、port 8080→8000 遷移等大量工作，並產出 `系統未完成項目總覽.md` 聲稱 MVP 100% 完成。「文件低估了完成度」「Dashboard 頁面文件不全」「API 參考表不全」三項已被那組工作處理掉。
>
> **更新 2**：本次已將全部中風險與低優先項目處理完畢。「kinder-vision 重複建設」一項使用者已確認 kinder-vision 為另一獨立專案，範圍外不處理。

---

## 1. 高風險（已處理 ✅）

- [x] **JWT_SECRET 是寫死的預設值，且沒有任何地方覆寫**
  - `docker-compose.yml` 補上開發預設值（明確標示不安全）；`deploy/docker-compose.prod.yml` 改成未設定就直接失敗；`deploy/README.md` 新增設定說明。

- [x] **Docker 版 backend 缺少一半的相依套件，會直接壞掉**
  - Dockerfile 改成從 `pyproject.toml` 動態安裝完整依賴清單，補上系統函式庫，`CMD` port 8080→8000 對齊。
  - **未驗證項目**：沙盒無 Docker，無法實際 `docker build` 確認。部署前建議跑一次 `docker compose build backend && docker compose up`。

---

## 2. 中風險（已處理 ✅）

- [x] **文件低估了完成度 — 節奏/凍結分析其實已經做好** → 已由並行工作處理（OPERATION.md 🚧 標記已移除）。本次額外把 §5.6 剩餘的矛盾措辭（標題仍寫「等待音樂來源」但欄位打 ✅）改成一致的「已可用」描述，並補上 `POST /api/sessions/{id}/music` 的交叉引用。

- [x] **影片分析用 in-memory + Thread 做任務佇列**
  - 目前 Dockerfile／`make dev-backend` 都是單一 process（無 `--workers`），現況可用，不算 bug。已在 `backend/app/api/video_analysis.py` 的 `_TASKS` 定義處加上明確註解，說明這個限制與未來若要水平擴展時該怎麼改（換成 DB/Redis-backed 佇列），避免以後有人在多 worker 環境下誤用。未強行實作 Redis 佇列——目前規模不需要，過度工程沒必要。

- [x] **`backend/hmeayc.db` 被提交進 git**
  - 已 `git rm --cached backend/hmeayc.db`（本機檔案還在，只是不再版控），`.gitignore` 補上 `*.db`。

- [x] **NSTC/backend 疑似與 kinder-vision 重複建設 — 使用者已確認**
  - kinder-vision 是另一個獨立專案，範圍外，暫不處理。調查結果（kinder-vision 最後 commit 2026-05-06、與 NSTC backend 為完全獨立的 git repo）保留於此供未來參考，但不列入待辦。

---

## 3. 低優先（已處理 ✅）

- [x] `.env.example` 補上 `SMTP_HOST/PORT/USER/PASSWORD/FROM`、`APP_BASE_URL`，並同步加進 `docker-compose.yml` 的 `environment:` 區塊（原本只在 `.env.example` 列出但 Docker 容器實際上收不到這些變數）。
- [x] Dashboard 頁面文件不全 → 已由並行工作處理，OPERATION.md §5.1 現已列出全部頁面。
- [x] API 參考表不全 → 已由並行工作處理，OPERATION.md §8.1 現已收錄 org 邀請、session start/end/activity、音樂、評估等端點。
- [x] 電量計算基準沒對齊 → 已修正：
  - `hardware/schematic.md` 電壓監測表改成同時列出韌體的 `BATTERY_FULL_MV`(4.20V)／`BATTERY_LOW_MV`(3.20V)／`BATTERY_EMPTY_MV`(2.80V) 與硬體實際 brownout(2.50V)，並說明 2.80V 是刻意設在硬體 brownout 之上、留 300mV 安全餘裕。
  - `firmware/main/battery.c` 原本的註解「2.8V = critical brownout level」具誤導性（實際 brownout 是 2.5V），已改成準確描述。
- [x] CM03 企劃書的演算法落差 → HT-Demucs/Bi-LSTM/MediaPipe Holistic 三處已由並行工作改成 librosa/MediaPipe Pose Landmarker；本次額外修正兩處殘留：
  - §4-2-2-1「核心晶片…以支援邊緣端 TinyML 推論」與後面「MCU 僅負責感測與傳輸，不做運算」自相矛盾，已統一為後者。
  - §4-2-3-2「YOLOv8-Pose 結合 ByteTrack」與實際程式碼（`_CentroidTracker`，一個「ByteTrack-like」的自製質心追蹤器，非真正的 ByteTrack）不符，已改為準確描述。

---

## 總結

這次稽核列出的高/中/低風險項目全部處理完畢。
