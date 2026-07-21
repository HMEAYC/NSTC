# 即時 AI 音樂學習工具之研發、實作與成效評估：支持幼兒整合性發展

> Real-time AI Music Learning Tool: Development, Implementation, and Evaluation for Promoting Early Childhood Integrated Development

本專案以 **HMEAYC（幼兒音樂與動作整合性發展）** 核心理論為基礎，採用 ESP32-C3 + MPU6500 IMU + Edge AI + Gemini 技術路線，由**朝陽科技大學**執行，計畫主持人為**李玲玉教授**。

---

## Monorepo 結構

```
├── dashboard/                 # 前端視覺化面板 (React + Vite + TypeScript)
├── backend/                   # 後端 AI Engine (FastAPI + PostgreSQL)
├── firmware/                  # ESP32-C3 + MPU6500 韌體 (ESP-IDF)
│   ├── main/ota_client.[ch]   # OTA 遠端韌體更新 (SHA-256 驗證 + GitHub Pages)
│   ├── main/device_registry.[ch]  # 裝置註冊 + 心跳
│   ├── main/wifi_config_nvs.[ch]  # 遠端 WiFi 設定管理 (API Key 認證)
│   ├── main/session_config_nvs.[ch]  # 遠端 Session 指派查詢（動態 WS 連線）
│   ├── main/softap_portal.[ch]     # SoftAP Captive Portal 配網
│   ├── main/websocket_client.[ch]  # WebSocket 客戶端 (自動推導 URI)
│   └── main/battery.[ch]          # 電池電量讀取
├── hardware/                  # 硬體設計 (schematic, PCB layout, BOM)
├── field-testing/             # 場域測試工具與數據記錄
├── deploy/                    # 部署腳本
├── .opencode/                 # opencode 組態與開發計畫（含架構規劃）
├── .dockerignore
├── .gitignore
├── Makefile                   # 常用指令快捷
├── docker-compose.yml         # 整合開發環境 (db + backend + dashboard)
├── start.sh / stop.sh         # 背景啟動/停止全部服務
└── OPERATION.md               # 完整操作手冊
```

## 快速開始

```bash
# 安裝後端依賴
make install-backend

# 安裝前端依賴
make install-dashboard

# 快速背景啟動全部服務
make start            # PostgreSQL + Backend(:8000) + Dashboard(:5173)
# 停止
make stop

# 或分別啟動（前景，推薦開發除錯用）
make dev              # docker compose
make dev-backend      # Terminal 1 — http://localhost:8000
make dev-dashboard    # Terminal 2 — http://localhost:5173/dashboard/
```

---

## 📌 專案基本資料

| 項目 | 說明 |
| :--- | :--- |
| **計畫名稱** | 即時 AI 音樂學習工具之研發、實作與成效評估：支持幼兒整合性發展 |
| **執行單位** | 朝陽科技大學 (統一編號: 78951384) |
| **執行期間** | 2026/08/01 ～ 2027/07/31 |
| **計畫主持人** | 李玲玉教授 |
| **技術路線** | A方案 (ESP32-C3 + MPU6500 IMU + Edge AI + Gemini) |
| **核心理論** | HMEAYC (幼兒音樂與動作整合性發展理論) |
| **WiFi 配網方式** | SoftAP Captive Portal（連線 `HMEAYC-Setup` → 輸入 WiFi） |
| **裝置認證** | API Key (`X-API-Key` header) + JWT Token (Dashboard) |
| **重要里程碑目標** | <ul><li>**2026年12月**：完成 MVP</li><li>**2027年01～03月**：進入場域測試</li><li>**2027年04～06月**：優化改善（正式版開發）</li><li>**2027年07月**：完成國科會結案</li></ul> |

---

## 🗓️ 專案月里程碑 (Milestones)

```mermaid
gantt
    title HMEAYC AI 專案時程與里程碑
    dateFormat  YYYY-MM
    axisFormat  %Y-%m

    section 準備期
    採購與建置             :active, 2026-08, 2026-09
    IRB 文件準備           :active, 2026-08, 2026-09

    section 技術開發
    AI 核心開發            :2026-09, 2026-11
    Dashboard 與整合        :2026-11, 2026-12
    MVP 完成               :milestone, 2026-12, 1d

    section 場域與正式版
    IRB 送審               :milestone, 2026-09, 1d
    場域測試               :2027-01, 2027-04
    優化改善               :2027-04, 2027-07
    結案完成               :milestone, 2027-07, 1d
```

| 期間 | 里程碑目標 | 主責 |
| :--- | :--- | :--- |
| **2026/08** | 採購下單、韌體基礎完成（IMU讀值 + 傳輸） | Rover |
| **2026/08～09** | IRB 文件起草、HMEAYC 指標確認、IRB 正式送審 | Liza |
| **2026/09～10** | AI 分析完成（節奏 + Freeze Dance） | Ychen |
| **2026/11** | Dashboard 與整合完成 | Ychen / Liza |
| **2026/12** | MVP 完成 | 全員 |
| **2027/01～03** | 場域測試（IRB 核准後進場） | Liza 主導 |
| **2027/04～06** | 優化改善（場域回饋迭代） | Ychen / Rover |
| **2027/07** | 結案 | Liza |

---

## 🎯 MVP 範圍 (MVP Scope)

* **IMU 資料收集**：即時感測幼兒肢體動作數據。
* **節奏分析**：偵測幼兒動作與音樂節奏的互動（支援即時 BPM 對齊）。
* **Freeze Dance 分析**：評估幼兒在音樂停止時的反應與身體控制（即時停止信號偵測）。
* **即時音樂源整合**：教師上傳音樂檔 → 後端預分析 BPM/beat/stop times → WebSocket 廣播 → IMU 即時對齊。
* **即時攝影機管線**：教師端攝影機 → WebSocket binary → 後端 YOLO + MediaPipe Pose → 即時姿勢估計 + 6 項 CV 指標。
* **ArcFace 人臉辨識**：InsightFace ArcFace R100（512 維）深度學習嵌入，自動降級 HOG（128 維）。
* **Dashboard 視覺化面板**：提供教師及研究人員即時觀看分析結果 + 節拍指示器 + 攝影機預覽。
* **Gemini 報告生成**：運用大型語言模型自動生成幼兒學習發展成效評估報告。

> [!IMPORTANT]
> **請勿於 12 月前新增其他功能，以確保 MVP 準時交付。**

---

## ✅ 系統完成度總覽

MVP 核心模組已全部完成實作，目前**無尚未完成或部分完成項目**（韌體、後端分析、Dashboard、部署、RBAC 均已對齊實際程式碼）。

| 模組 | 狀態 |
|------|------|
| 韌體（ESP32-C3 + MPU6500 IMU） | ✅ 完成 |
| SoftAP Captive Portal 配網 | ✅ 完成 |
| 裝置心跳（2 分鐘） | ✅ 完成 |
| 網路掃描發現（ARP + Espressif OUI） | ✅ 完成 |
| SHA-256 OTA 驗證 | ✅ 完成 |
| 後端 WebSocket 即時串流 | ✅ 完成 |
| 節奏分析 `rhythm.py` | ✅ 完成 |
| Freeze Dance 分析 `freeze_dance.py` | ✅ 完成 |
| 巨觀分析 `macro.py`（隊形/熱區/參與度） | ✅ 完成 |
| 微觀分析 `micro.py`（追蹤/流暢度） | ✅ 完成 |
| 指標燈號 `metrics.py` | ✅ 完成 |
| 跨模態裝置配對（FFT + Hungarian） | ✅ 完成 |
| 課程管理（CRUD + 開始/結束 + 評分） | ✅ 完成 |
| 多租戶 RBAC（4 角色 + JWT + org_id 隔離） | ✅ 完成 |
| Dashboard 20 個頁面 | ✅ 完成 |
| Docker Compose 一鍵啟動 | ✅ 完成 |
| OTA 韌體更新 | ✅ 完成 |
| 教案 PDF 匯入工具 | ✅ 完成 |
| 即時音樂源整合 | ✅ 完成（2026/07） |
| 即時攝影機管線 | ✅ 完成（2026/07） |
| ArcFace 人臉辨識（InsightFace R100 + HOG 降級） | ✅ 完成（2026/07） |

<details>
<summary>即時音樂源整合 — 實作明細</summary>

| 項目 | 狀態 |
|------|------|
| 後端 `music.py`：librosa BPM/beat/stop 分析 | ✅ |
| Session 音樂欄位（7 欄）+ Alembic migration | ✅ |
| `POST/DELETE /api/sessions/{id}/music` | ✅ |
| `POST /api/sessions/{id}/music-url`（CD 曲目 → music_url） | ✅ |
| `RealtimeAnalyzer`：1500 緩衝、250 幀節奏分析 | ✅ |
| WS `rhythm_update`/`freeze_update` 持久化至 DB | ✅ |
| `assessments.py` 整合 rhythm.py/freeze_dance.py | ✅ |
| `BeatIndicator.tsx`：BPM 脈衝 + 同步率 | ✅ |
| `LiveView.tsx`：YouTube embed / audio 播放器 | ✅ |
| `SessionDetail.tsx`：音樂上傳/BPM/CD 曲目選擇 | ✅ |
| `Templates.tsx`：CD 曲目新增 link 欄位 | ✅ |
| 音樂分析快取（file hash LRU） | ✅ |

</details>

<details>
<summary>即時攝影機管線 — 實作明細</summary>

| 項目 | 狀態 |
|------|------|
| `RealtimeVideoAnalyzer`：YOLO + MediaPipe + Centroid 追蹤 | ✅ |
| 6 項 CV 指標即時計算（投入度/隊形/空間/步態/平衡/協調） | ✅ |
| WebSocket binary 攝影機幀接收 + camera_start/stop 訊息 | ✅ |
| `useCamera.ts`：前端 getUserMedia → Canvas → JPEG 10fps | ✅ |
| `LiveView.tsx`：攝影機預覽 + COCO-17 骨架疊加 | ✅ |
| `AssessmentIndicators.tsx`：6 項 CV 指標從 placeholder 改為真實數據 | ✅ |
| Alembic: CV metrics 持久化至 AnalysisResult | ✅ |

</details>

> 場域測試（IRB 核准 + 硬體採購完成後進場）進度見下方「🚀 近期執行任務」與「💡 後續下一步」。

---

## 👥 團隊與分工

| 成員 | 角色 | 主要負責範圍 |
| :--- | :--- | :--- |
| **李玲玉 (Liza)** | 計畫主持人 | HMEAYC 指標定義、IRB 主責、場域測試協定、教師培訓、論文主筆、驗收報告品質 |
| **陳育亮 (Ychen)** | 軟體開發 | `backend/`（節奏 + Freeze Dance）、`backend/app/gemini/`（Gemini 報告）、`dashboard/`（前後端） |
| **陳育冠 (Rover)** | 硬體開發 | `firmware/`（ESP32-C3 + MPU6500）、WiFi 傳輸、硬體採購 |

**關鍵介面點：**
- Rover ↔ Ychen：IMU 傳輸協定格式 (WebSocket JSON)，需在 **07 月底前** 對齊
- Ychen ↔ Liza：HMEAYC 分析指標定義，需在 **08 月初前** 確認

---

## 🚀 近期執行任務

### IRB 倫理審查準備
> [!WARNING]
> **IRB 準備工作必須立即啟動！目標 9 月底送審，11～12 月取得核准。**
> 需準備文件：
> - 家長同意書 / 幼兒資料同意書 / 個資告知書 / 研究說明書

### 採購清單 (硬體)

| 項目 | 數量 | 用途 |
|------|------|------|
| ESP32-C3-MINI-1 模組 | 10 | 穿戴式感測器主控 |
| MPU6500 IMU 感測器 | 10 | 6 軸動作偵測 |
| 16500 Li-ion 電池 (800mAh) | 10 | 外部電源 |
| 16500 電池盒 (含 JST 2.0 線) | 10 | 電池座 |
| USB-C 連接器 | 10 | 程式燒錄 |
| Android 平板 | 2 | 場域施測 |
| WiFi 路由器 | 1 | 場域網路 |

### 場域測試前置作業

1. **IRB 送審文件** — 見上方「IRB 倫理審查準備」（Liza 主責）
2. **硬體採購** — 見上方採購清單（Rover 主責）
3. **場域 WiFi 環境建置** — 路由器 + 教室網路拓撲驗證
4. **場域測試執行** — IRB 核准後進場

---

## 🔐 多租戶 RBAC 系統（已實作）

此專案已實作完整多租戶角色權限架構，支援多幼兒園/多班/多教師/多家長同時使用：

| 角色 | 權限範圍 |
|------|---------|
| **super_admin** | 全域管理，可檢視/管理所有組織 |
| **org_admin** | 管理所屬組織的教師/班級/裝置/幼兒 |
| **teacher** | 開課、查看所屬班級幼兒報告與指標 |
| **parent** | 唯讀檢視自己綁定幼兒的報告與發展歷程 |

### 認證方式

- **JWT Token** — Dashboard 使用者透過 `POST /api/auth/login` 取得 Bearer token
- **API Key** — ESP32 裝置與影片分析後台仍使用傳統 X-API-Key

### 新增 API

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/auth/login` | 登入取得 JWT |
| `GET` | `/api/auth/me` | 當前使用者資訊 |
| `GET` | `/api/admin/orgs` | 組織列表（super_admin） |
| `GET` | `/api/orgs/{orgId}/classes` | 班級列表 |
| `POST` | `/api/children/{childId}/parents` | 綁定家長 |
| `GET` | `/api/parents/me/children` | 家長查看幼兒 |
| `POST` | `/api/consent` | 上傳家長同意書 |
| `GET` | `/api/admin/export/anonymized` | 匿名化資料匯出 |

> 📋 詳細架構與實作記錄請見 [`.opencode/plans/multi-tenant-rbac.md`](.opencode/plans/multi-tenant-rbac.md)

---

## 👥 多人系統裝置管理（Cross-Modal Device Assignment）

基於論文 *"A Cross-Modal Child Identification Framework for AI-Assisted Music Learning"* 設計，解決 N 個小孩戴 N 條腰帶時的自動配對問題。

### 核心架構

```
┌─────────────────────┐     ┌──────────────────────┐
│  ESP32-C3 腰帶 × N   │     │  天花板攝影機          │
│  IMU 50Hz WebSocket  │     │  MediaPipe Pose 30fps │
└────────┬────────────┘     └──────────┬───────────┘
         │                             │
         ▼                             ▼
┌──────────────────────────────────────────────┐
│              FastAPI 後端伺服器                  │
│                                                │
│  1. FFT 相位提取 @BPM 頻率                      │
│  2. N² 候選自校準演算法                          │
│  3. Hungarian 全域最優指派                       │
│  4. 信心分數計算 + 教師手動覆寫                   │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│    Dashboard 裝置管理頁                        │
│   📡 裝置列表 / 👤 學員管理 / 🔗 配對機制       │
└──────────────────────────────────────────────┘
```

### API 端點

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/devices` | 列出所有註冊裝置（ESP32 腰帶） |
| `POST` | `/api/devices` | 註冊/更新裝置（ESP32 連線時自動呼叫） |
| `GET` | `/api/children` | 列出所有學員 |
| `POST` | `/api/children` | 註冊學員 |
| `GET` | `/api/sessions/{id}/assignments` | 查詢課程配對結果 |
| `POST` | `/api/sessions/{id}/assign` | 執行裝置-學員配對 |

### Dashboard 頁面

| 路徑 | 頁面 | 說明 |
|------|------|------|
| `/dashboard/templates` | 教案模板 | 建立可重複使用的課程階段模板 |
| `/dashboard/sessions` | 課程管理 | 排程、開課、管理課程生命週期 |
| `/dashboard/sessions/:id` | 課程詳情 | 檢視課程階段、評估、開始/結束課程 |
| `/dashboard/sessions/:id/report` | 課程報告 | 課程完整 AI 分析報告 |
| `/dashboard/live/:sessionId` | 即時監控 | 即時 IMU 6 軸圖表 + 攝影機預覽 + 姿勢骨架疊加 |
| `/dashboard/history` | 課程紀錄 | Session 列表 |
| `/dashboard/devices` | 裝置管理 | ESP32 穿戴式裝置列表（狀態/電量/韌體/WiFi） |
| `/dashboard/assessment/:sessionId` | 評估指標 | 即時 IMU + CV 指標運算（活動量/平穩度/穩定指數/投入度/隊形/空間/步態/平衡/協調） |

### 資料庫模型

- **Device** — ESP32 腰帶註冊（device_id, name, firmware_version, battery_level, status, active_session_id）
- **Child** — 學員資料（name, student_id, notes）
- **DeviceAssignment** — 配對記錄（session_id, device_id, child_id, confidence, method）

---

## 🔄 OTA 遠端韌體更新

ESP32 透過 AB 分割區支援 OTA，不須 USB 即可更新韌體。

### 流程

1. **建置新版韌體**：`cd firmware && idf.py build`
2. **上傳至後端**：Dashboard「韌體更新」頁面或 `curl -X POST /api/firmware/upload`
3. **ESP32 自動更新**：每 24 小時檢查 GitHub Pages 版本，下載新版 → 重啟

### API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/firmware/upload` | 上傳韌體 binary（multipart） |
| GET | `/api/firmware/list` | 列出所有版本 |

> **註**：OTA 版本檢查已改用 GitHub Pages（`https://HMEAYC.github.io/NSTC/ota/version.json`）。

---

## 💡 後續下一步

> 已完成項目見上方「✅ 系統完成度總覽」，此處僅列尚待進行的工作。

| # | 項目 | 狀態 | 說明 |
|---|------|------|------|
| 1 | 硬體採購下單 → 打樣 PCB + 焊接測試 | ⏳ 待 Rover | ESP32-C3 + MPU6500 腰帶硬體 |
| 2 | 場域測試（IRB 核准後進場） | ⏳ 待 Liza | IRB 送審 → 核准後進場 |
| 3 | 跨模態配對演算法真實場域驗證 | ⏳ 待場域測試 | 需真實場域數據 |
| 4 | 正式版系統迭代（場域回饋整合） | ⏳ 待場域測試 | 場域回饋後迭代 |
| 5 | MVP 里程碑追蹤 | 📋 進行中 | 2026/12 目標完成 |
