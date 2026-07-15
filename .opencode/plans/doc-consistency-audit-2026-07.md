# 文件一致性稽核（2026-07-14）

> 對 NSTC 全部文件（README、OPERATION、hardware/*、field-testing/*、deploy/README、documents/ 企劃書 docx/pdf）與實際程式碼進行比對後發現的矛盾點，依優先順序列出待處理項目。

---

## 1. 高優先（企劃書「願景版」vs 實際系統）

- [x] **主控晶片型號不符** → 已定案：**ESP32-C3 + MPU6500**。兩份企劃書（`AI音樂學習工具_正式版執行計畫書.docx`、`CM03-Fianl(2).docx`）已將 ESP32-S3 → ESP32-C3（共 4 處）、MPU6050/LSM6DS3 → MPU6500（1 處）修正並驗證通過。
- [ ] **通訊架構落差**：企劃書描述 ESP-NOW/UDP 廣播、<50ms 雙向震動回饋；實作是 WiFi + WebSocket JSON 單向上傳，無下行指令。（待處理，見下方「待決」）
- [ ] **麥克風／震動回饋／LED 硬體未落地** → 已定案：**硬體沒有麥克風、沒有震動馬達、也沒有 WS2812B LED**。
  - [x] hardware/README.md、schematic.md、pcb_layout.md：已移除 LED（BOM、接線圖、電路圖、佈局圖），schematic.md 同步修正為單一電池。
  - [x] firmware：已移除 `led_status.[ch]`、main.c 中的呼叫、CMakeLists / idf_component.yml 相依。
  - [x] 企劃書晶片/IMU 型號已修正（見上）。
  - [x] **CM03-Fianl(2).docx 的麥克風／震動回饋敘述已改寫**：3-6-2、3-6-3、4-2-1、4-2-2、4-2-3、4-3、4-4 與七個教學模組（AI 凍結遊戲、AI 高低音探險、AI 速度挑戰、AI 節奏船長、AI 變形模仿貓、AI 動物力士）共 27 處改寫，技術邏輯改為：腰帶僅負責 IMU 採集與 50Hz WebSocket 串流，不做聲學/節奏運算；即時指標（活躍度/平穩度/穩定指數）由教師 Dashboard 瀏覽器端運算；節奏同步、凍結穩定指數由後端事後分析；各教學活動的「聽覺/觸覺回饋」改為「教師即時反饋」（Dashboard 燈號 + 教師口語/肢體引導），與文件既有「教師為數據解讀者」理念一致。已用 pandoc/PDF 渲染核對排版與內容。
- [ ] **演算法複雜度落差**：企劃書提到 HT-Demucs 音源分離、Bi-LSTM 節拍追蹤、Kalman filter、TinyML 蒸餾；實作 `analysis/rhythm.py`、`analysis/freeze_dance.py` 目前是 FFT 相位比對 + RMS 能量，屬 MVP 簡化版。（待處理）
- [x] **里程碑時間軸矛盾** → 已定案採用「2026/12 完成 MVP、2027/01～03 場域測試」。README.md 的 Gantt、里程碑表、月里程碑表、MVP 範圍警語已同步更新。

## 2. 中優先（文件之間互相矛盾）

- [x] **跨模態自動配對是否已實作** → 已確認實際已實作（`backend/app/api/pairing.py` 的 `/auto-pair`）。已更新 `field-testing/device-management-guide.md`，改為描述「已實作」並補上正確的 `method` 值（`fft_phase_cross_modal` / `fft_phase_imu_only`）。
- [x] **OPERATION.md 內部不一致** → 已在 §8.1 補上 `POST /api/sessions/{id}/auto-pair` 端點。
- [x] **測試數量寫錯** → 已更正為「22 passed」「19 條路由」，並列出完整測試分類。
- [x] **驗證項目數寫錯** → 已更正為「17 項測試通過標準」，補上第 16-17 項 Dashboard 頁面檢查。
- [x] **schematic.md 疑似殘留舊版雙電池設計** → 已修正為單一 16500 電池（§5 標題與內文），移除 D1/D2 雙電源敘述。

## 3. 低優先（文件未跟上程式碼）

- [x] **Dashboard 頁面文件不全**：OPERATION.md §5.1 頁面表只列 12 個路徑，實際 `dashboard/src/App.tsx` 有 21 個路由，缺 `/dashboard/login`、`/register`、`/accept-invite`、`/firmware`、`/wifi`、`/classes/:classId`、`/classes/:classId/assessments`、`/children/:childId/assessments`、`/parent`。→ 已更新為 20 個路由（WiFi 頁面已移入設備管理）
- [ ] **API 參考表不全**：實際後端已有 org 邀請流程（`/api/orgs/{orgId}/invite`、`/api/auth/complete-invite`）、`/{session_id}/start`、`/{session_id}/end`、`/{session_id}/activity`、評估相關端點等，OPERATION.md §8.1 都未收錄。
- [ ] **電量計算基準沒對齊**：韌體 `battery.c` 以 3300mV=0%、4200mV=100% 算百分比；hardware 文件另定義「3.05V＝低電量警告」「2.80V＝brownout 截止」，兩套門檻沒有對應到韌體邏輯。

---

## 建議處理順序

1. ~~先決定企劃書與實作的技術路線要不要對齊~~ → 已定案：ESP32-C3 + MPU6500，無麥克風/震動/LED。
2. ~~更新 device-management-guide.md 的 auto-pair 狀態說明~~ → 已完成。
3. ~~修正 OPERATION.md 的測試數字與 API 清單~~ → 已完成。
4. ~~確認 schematic.md 雙電源段落~~ → 已修正為單一電池。

### 剩餘待辦

- ~~CM03-Fianl(2).docx 麥克風/震動回饋章節重寫~~ → 已完成（完全改寫，見上）。連帶處理了通訊架構落差（ESP-NOW/UDP → WebSocket）。
- **演算法複雜度落差**（HT-Demucs/Bi-LSTM/Kalman filter/TinyML 蒸餾 vs 實際 FFT+RMS）：這次僅處理麥克風/震動相關段落，HT-Demucs（音源分離）、Bi-LSTM（節拍追蹤）等雲端音訊演算法描述**尚未改寫**，因其不直接涉及麥克風硬體（可能指處理課程音樂檔案本身），且未包含在本次決議範圍內。
- **低優先項目**（Dashboard 頁面文件、API 參考表不全、電量計算基準）尚未處理。
