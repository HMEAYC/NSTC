# HMEAYC 系統操作手冊

> 即時 AI 音樂學習工具 — 系統部署、操作與驗證完整指南

---

## 目錄

1. [系統概覽](#1-系統概覽)
2. [環境需求](#2-環境需求)
3. [快速啟動](#3-快速啟動)
4. [韌體操作](#4-韌體操作)
5. [Dashboard 操作指南](#5-dashboard-操作指南)
6. [多人裝置管理](#6-多人裝置管理)
7. [評估指標說明](#7-評估指標說明)
8. [API 參考](#8-api-參考)
9. [驗證方法](#9-驗證方法)
10. [疑難排解](#10-疑難排解)

---

## 1. 系統概覽

```
┌────────────────────────────────────────────────────────────┐
│                     HMEAYC 系統架構                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────┐       ┌──────────────────┐          │
│  │  ESP32-C3 腰帶    │       │  天花板攝影機      │          │
│  │  MPU6500 IMU     │       │  MediaPipe Pose   │          │
│  │  50Hz WebSocket  │       │  30fps skeleton   │          │
│  └───────┬──────────┘       └────────┬─────────┘          │
│          │ WS JSON                   │ REST (keypoints)    │
│          ▼                           ▼                     │
│  ┌──────────────────────────────────────────────┐          │
│  │           FastAPI 後端 (:8000)                 │          │
│  │                                                │          │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐ │          │
│  │  │ Session │ │ Analysis │ │ Device/Child   │ │          │
│  │  │ Manager │ │ Engine   │ │ Manager        │ │          │
│  │  └────┬────┘ └────┬─────┘ └───────┬────────┘ │          │
│  │       │           │               │          │          │
│  │  ┌────▼───────────▼───────────────▼────────┐ │          │
│  │  │          PostgreSQL                     │ │          │
│  │  │  sessions / imu_data / analysis_results │ │          │
│  │  │  reports / devices / children / assigns │ │          │
│  │  └─────────────────────────────────────────┘ │          │
│  └──────────────────────┬───────────────────────┘          │
│                         │                                  │
│                         ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │       React Dashboard (:5173)                │          │
│  │                                                │          │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │          │
│  │  │ Templates│ │ Courses  │ │ LiveView       │ │          │
│  │  │ 教案模板 │ │ 課程管理 │ │ 即時監控       │ │          │
│  │  └──────────┘ └──────────┘ └────────────────┘ │          │
│  │  ┌──────────┐ ┌────────────────┐              │          │
│  │  │ History  │ │ Assessment     │              │          │
│  │  │ 課程紀錄 │ │ 指標總覽       │              │          │
│  │  └──────────┘ └────────────────┘              │          │
│  │  ┌──────────┐ ┌──────────┐                    │          │
│  │  │ Devices  │ │ Classes  │                    │          │
│  │  │ 裝置管理 │ │ 班級管理 │                    │          │
│  │  └──────────┘ └──────────┘                    │          │
│  └──────────────────────────────────────────────┘          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 元件說明

| 元件 | 技術 | 用途 |
|------|------|------|
| ESP32-C3 腰帶 | ESP-IDF v5.4 + MPU6500 | 穿戴式 IMU 感測（加速度 ±16g / 陀螺儀 ±2000°/s @ 50Hz） |
| 後端伺服器 | FastAPI + PostgreSQL + SQLAlchemy | IMU 資料接收、分析運算、裝置管理、報告生成 |
| Dashboard | React 19 + Vite 8 + TypeScript + Recharts + Tailwind v4 | 即時監控、歷史查詢、評估指標、裝置管理 |
| 資料庫 | PostgreSQL | 持久化 IMU 資料、分析結果、報告、裝置與學員 |
| 韌體 OTA | HTTP（LAN）/ HTTPS（生產） | 無線韌體更新 |

---

## 2. 環境需求

### 軟體

| 工具 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.11 | 後端執行環境 |
| Node.js | ≥ 20 | Dashboard 執行環境 |
| Docker & Docker Compose | 最新 | PostgreSQL 資料庫（開發） |
| ESP-IDF | v5.4 | 韌體編譯 |
| Git | 最新 | 版本控制 |

### 硬體

| 項目 | 數量 | 說明 |
|------|------|------|
| ESP32-C3 開發板 | ≥ 1 | 執行韌體，連接 IMU |
| MPU6500 模組 | ≥ 1 | I2C 介面，位址 0x68 |
| USB-C 傳輸線 | 1 | 燒錄韌體用 |
| WiFi 路由器 | 1 | ESP32 連網，SSID: chen |

### 連接埠

| 連接埠 | 用途 |
|--------|------|
| 5432 | PostgreSQL |
| 8000 | FastAPI 後端 |
| 5173 | Vite Dashboard |

---

## 3. 快速啟動

### 3.1 背景啟動（建議日常使用）

```bash
# 安裝相依套件（首次執行）
make install-backend    # pip install -e ".[dev]"
make install-dashboard  # npm install

# 背景啟動全部服務
make start              # 等同 bash start.sh
# PostgreSQL + Backend(:8000) + Dashboard(:5173) 全部在背景執行

# 停止全部服務
make stop               # 等同 bash stop.sh
```

### 3.2 終端機啟動（開發用，log 即時顯示）

```bash
# 方法 A：全部一起
make dev                # docker compose up --build

# 方法 B：分三個 terminal 各開一個
# Terminal 1 — 資料庫
docker compose up -d db

# Terminal 2 — 後端
make dev-backend        # uvicorn app.main:app --reload --port 8000

# Terminal 3 — Dashboard
make dev-dashboard      # npm run dev
```

### 3.3 逐步啟動

**Step 1 — 資料庫：**

```bash
cd /path/to/HMEAYC
docker compose up -d db

# 驗證
psql -h localhost -U hmeayc -d hmeayc -c "\dt"
```

**Step 2 — 後端：**

```bash
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 驗證
curl http://localhost:8000/health
# → {"status":"ok"}
```

**Step 3 — Dashboard：**

```bash
cd dashboard
npm run dev

# 驗證
open http://localhost:5173/dashboard/
```

### 3.4 啟動方式比較

| 方式 | 指令 | 優點 | 缺點 |
|------|------|------|------|
| 背景啟動 | `make start` | 一鍵啟動全部，不會被意外關閉 | 需 `make stop` 手動停止 |
| 終端機分開 | `make dev-backend` + `make dev-dashboard` | log 即時顯示，方便除錯 | 需佔用 terminal |
| Docker | `make dev` | 完整容器化，環境一致 | 需額外設定 volume |

> **建議：** 日常開發使用 `make start`（背景），需要看 log 時用 `make stop` 後改開三個 terminal。

### 3.5 啟動狀態檢查

```bash
# 全部服務運行檢查
echo "DB:      $(psql -h localhost -U hmeayc -d hmeayc -c 'SELECT 1' 2>&1 | tail -1)"
echo "Backend: $(curl -s http://localhost:8000/health)"
echo "Dash:    $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/dashboard/)"
```

---

## 4. 韌體操作

### 4.1 建置與燒錄

```bash
cd firmware

# 啟動 ESP-IDF 環境
source /path/to/esp-idf/export.sh

# 建置
idf.py build

# 燒錄（確認連接埠）
ls /dev/cu.usbmodem*   # macOS
idf.py -p /dev/cu.usbmodem1101 flash
```

### 4.2 監控 Serial Log

```bash
idf.py -p /dev/cu.usbmodem1101 monitor

# 預期輸出
# I (381) HMEAYC: HMEAYC firmware v1.0.0 starting (ESP32-C3 + MPU6500)...
# I (501) MPU6xxx: WHO_AM_I verified: 0x70
# I (511) MPU6xxx: MPU6xxx initialized (I2C 0 @ 0x68)
# I (511) HMEAYC: connecting WiFi...
# I (512) HMEAYC: WiFi connected, IP: 192.168.1.199
# I (512) HMEAYC: WebSocket connecting...
```

### 4.3 WiFi 設定

韌體初始值設定在 `firmware/sdkconfig.defaults`，實際場域可透過 Dashboard 的「裝置管理」頁面，點擊設備後在彈窗底部「📶 WiFi 設定」區塊寫入。
ESP32 會在連線後定期向 `/api/config/wifi?include_password=true&device_id=...` 讀取設定，並在 NVS 中保留最新值。

```
CONFIG_HMEAYC_WIFI_SSID="chen"
CONFIG_HMEAYC_WIFI_PASSWORD="12345678"
CONFIG_HMEAYC_WS_URI="ws://192.168.1.105:8000/ws/default"
```

> 提示：裝置管理彈窗中會顯示密碼欄位（可顯示/隱藏）；韌體端則透過 `include_password=true` 取回完整設定以便更新 NVS。

### 4.5 動態 Session 指派

ESP32 開機時連線到 `/ws/default`，然後向 `GET /api/config/session?device_id=<device_id>` 查詢被指派到的 Session ID：

1. 教師在 Dashboard 開課 → 指派裝置到某個 session
2. 後端寫入 `devices.active_session_id`
3. ESP32 定時輪詢（每 30 分鐘），發現 session 變更後自動重連 WebSocket
4. 即時監控頁面即可收到來自正確 session 的 IMU 資料

若想立即觸發重連，可在 Dashboard 重新指派裝置，或在裝置管理彈窗中更新 WiFi 設定後儲存。

### 4.4 OTA 更新（Dashboard）

1. 開啟 `http://localhost:5173/dashboard/firmware`
2. 上傳新版 firmware binary
3. ESP32 會自動檢查更新版本
4. 下載並寫入 inactive partition
5. 重啟後從新 partition 啟動

---

## 5. Dashboard 操作指南

### 5.1 頁面一覽

| 路徑 | 頁面 | 功能 |
|------|------|------|
| `/dashboard/login` | 登入 | Email + Password 登入 |
| `/dashboard/register` | 註冊 | 建立新帳號 |
| `/dashboard/accept-invite` | 接受邀請 | 完成 org invite 流程 |
| `/dashboard/` | 首頁 | 導航卡片 + 課程統計 + 最近課程 |
| `/dashboard/sessions` | 課程管理 | 排程、開課、管理課程生命週期 |
| `/dashboard/sessions/:id` | 課程詳情 | 檢視課程階段、評估、開始/結束課程、裝置配對、學生評分 |
| `/dashboard/sessions/:id/report` | 課程報告 | 課程完整 AI 分析報告 |
| `/dashboard/templates` | 教案模板 | 建立可重複使用的課程階段模板 |
| `/dashboard/live/:sessionId` | 即時監控 | IMU 6 軸即時圖表 + WS 連線狀態 + 節拍指示器 + 音樂資訊 |
| `/dashboard/history` | 課程紀錄 | Session 列表 |
| `/dashboard/assessment/:sessionId` | 評估指標 | 即時行為指標運算（IMU/CV） |
| `/dashboard/devices` | 裝置管理 | ESP32 腰帶註冊、狀態檢視、WiFi 設定 |
| `/dashboard/firmware` | 韌體更新 | 上傳與管理 ESP32 韌體版本 |
| `/dashboard/classes` | 班級管理 | 班級 CRUD + 教師/幼兒資料管理 |
| `/dashboard/classes/:classId` | 班級詳情 | 幼兒列表、家長綁定/解綁 |
| `/dashboard/classes/:classId/assessments` | 班級評估 | 跨 Session 班級評估彙整 |
| `/dashboard/children/:childId/assessments` | 幼兒評估 | 跨 Session 個人分析趨勢圖 |
| `/dashboard/admin` | 機構管理 | 組織列表（super_admin 專用） |
| `/dashboard/admin/users` | 帳號管理 | 建立與管理教師、家長帳號 |
| `/dashboard/parent` | 家長專區 | 唯讀檢視綁定幼兒的報告與發展歷程 |

### 5.2 首頁（Landing）

依角色顯示不同區塊：

**📋 課程教學（教師/管理員）：**
- **教案模板** — 建立可重複使用的課程階段模板
- **課程管理** — 排程、開課、管理課程生命週期
- **即時監控** — 即時 IMU 6 軸圖表

**📊 課程紀錄（教師/管理員/家長）：**
- **課程紀錄** — 瀏覽過去所有課程與分析紀錄

**⚙️ 系統管理（教師/管理員）：**
- **班級管理** — 管理班級、教師與幼兒資料
- **裝置管理** — 檢視連線裝置與狀態
- **帳號管理** — 建立與管理教師、家長帳號（管理員專用）

### 5.3 即時監控（LiveView）

**路徑：** `/dashboard/live/:sessionId`

顯示：
- WS 連線狀態指示燈（綠/黃/紅）
- Session ID
- 6 軸即時數值卡片（AX, AY, AZ, GX, GY, GZ）
- 加速度（g）即時折線圖
- 角速度（dps）即時折線圖

**操作：**
1. ESP32 開機後會自動查詢被指派的 session，連線到正確的 WebSocket
2. Dashboard 開啟 `/dashboard/live/<session_id>` 即可顯示即時資料
3. 若裝置未被指派 session，會連到 `/ws/default`，此時可用 `/dashboard/live/default` 檢視
4. 最多保留 200 筆資料點，自動滑動

### 5.4 課程紀錄（History）

**路徑：** `/dashboard/history`

顯示：
- 所有 Session 列表（ID、開始時間、狀態）
- 狀態標籤：completed（綠）/ active（藍）
- 點擊進入該 Session 的單次報告頁面

### 5.5 課程報告（SessionReport）

**路徑：** `/dashboard/sessions/:id/report`

顯示：
- 課程級別的整合報告
- 包含：課程基本資訊、統計摘要（課程次數/IMU 資料量/裝置數）、各次課程列表
- 各次課程的平均活動量與詳細分析

### 5.6 評估指標（Assessment）

**路徑：** `/dashboard/assessment/default`

三區段：

**🟢 IMU 即時運算（無需外部資料）：**

| 指標 | 計算方式 | 燈號 | 說明 |
|------|---------|------|------|
| 🏃 動作活躍度 | 加速度 RMS | 適中/偏高/過高 | 運動強度代理 |
| 🎯 動作平穩度 | 加速度變異係數 (CV) | 平穩/普通/僵硬 | 動作流暢度 |
| ⚖️ 身體穩定指數 | 1 − CV | 穩定/尚可/不穩 | 身體控制能力 |

**🟡 需音樂參考（演算法就緒，等待音樂來源）：**

| 指標 | 說明 | 現狀 |
|------|------|------|
| 🎵 節奏同步誤差 | FFT 相位匹配 vs 音樂拍點 | 🚧 需 BPM + beat tracking |
| 🧊 凍結反應/穩定度 | 音樂停止瞬間反應時間 + 穩定度 | 🚧 需 RMS energy drop 訊號 |

**🔴 需攝影機資料（需 YOLO + MediaPipe）：**

| 指標 | 說明 |
|------|------|
| 👥 團體投入度 | 活躍比例（>0.5cm/s） |
| 📐 隊形穩定度 | 幾何分類信心均值 |
| 🗺️ 空間利用率 | 3×3 熱區分布離散度 |
| 🦶 步態對稱性 | 左右腳支撐期比對 |
| 🧘 平衡搖擺面積 | 質心投影軌跡 |
| 🤝 上下肢協調 | PLV 相位鎖定值 |

### 5.7 裝置管理（Devices）

**路徑：** `/dashboard/devices`

單頁列表顯示所有註冊 ESP32 腰帶：
- 項目：名稱、Device ID、韌體版本、WiFi SSID、訊強度、IP、電量、最後上線時間、狀態
- 狀態指示燈（綠 = 連線中 / 灰 = 離線）
- 額外加掛韌體 / WiFi 設定頁面快速連結
- ESP32 開機會自動註冊（含 WiFi 資訊）

> 學員註冊與班級管理移至 `/dashboard/classes`。

---

## 6. 多人裝置管理

### 6.1 概念流程

```
ESP32 開機 → 自動註冊裝置（POST /api/devices）
                                      ↓
教師登入 Dashboard → 開課（/dashboard/sessions）→ 課程詳情頁
                                      ↓
                         點擊學童列 → 配對彈窗
                          ├── 手動選擇裝置配對
                          ├── 🔗 跨模態自動配對（FFT + Hungarian）
                          └── 解除配對
                                      ↓
                         確認配對結果 + 信心分數
```

### 6.2 裝置註冊

**自動註冊：** ESP32 開機並連上 WiFi 後，韌體會主動送出 `POST /api/devices`，以 `device_id`、`firmware_version`、`wifi_ssid`、`wifi_rssi`、`ip_address` 更新裝置狀態。可在 Dashboard 裝置列表看到。

**手動註冊（測試）：**

```bash
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-001","name":"腰帶 A","firmware_version":"v0.1.0"}'
```

### 6.3 學員註冊

**Dashboard 操作：**
1. 開啟 `/dashboard/classes` → 選擇班級
2. 在班級詳情頁點擊「+ 註冊學員」
3. 填寫姓名（必填）、學號（選填）、備註（選填）

**API：**

```bash
curl -X POST http://localhost:8000/api/children \
  -H "Content-Type: application/json" \
  -d '{"name":"小明","student_id":"S001","notes":"3歲"}'
```

### 6.4 課程配對

**手動配對（教師操作）：**

```bash
# 1. 建立課程
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"測試課程","class_id":"...","template_id":"..."}'

# 2. 配對腰帶 → 學員
curl -X POST http://localhost:8000/api/sessions/{SESSION_ID}/assign \
  -H "Content-Type: application/json" \
  -d '{"device_id":"{DEVICE_UUID}","child_id":"{CHILD_ID}","confidence":0.95}'

# 3. 查詢配對結果
curl -s http://localhost:8000/api/sessions/{SESSION_ID}/assignments \
  | python3 -m json.tool
```

> 配對後後端會自動寫入 `devices.active_session_id`，ESP32 在下次輪詢時會自動重連到該 session 的 WebSocket。

**回應範例：**
```json
{
  "assignments": [
    { "device_name": "腰帶 A", "child_name": "小明", "confidence": 0.95, "method": "manual" },
    { "device_name": "腰帶 B", "child_name": "小華", "confidence": 0.88, "method": "manual" }
  ]
}
```

### 6.5 跨模態自動配對（已實作）

論文演算法（FFT 相位匹配 + Hungarian 指派）已實作為 `POST /api/sessions/{id}/auto-pair`，可在課程詳情頁的配對彈窗中點擊「🔗 跨模態自動配對」執行。

**流程：**
1. 系統擷取每個裝置的 IMU 加速度 magnitude，執行 FFT 取得主頻率與相位
2. 若攝影機已上傳課程錄影，系統對 IMU 相位與視覺髖部軌跡相位進行交叉相關
3. 對所有 N² 候選對執行 Hungarian 全域最優指派
4. 回傳每組配對的信心分數（含 BPM 估計值）
5. 教師可在彈窗中「採用」建議配對或手動覆寫

> 無攝影機資料時，仍會以 IMU 頻譜相位分析進行建議配對，但信心較低。

---

## 7. 評估指標說明

### 7.1 即時 IMU 指標（前端計算）

來自 WebSocket 串流的加速度資料，在瀏覽器中即時計算：

| 指標 | 公式 | 區間 | 意義 |
|------|------|------|------|
| 動作活躍度 | `RMS(mag(ax, ay, az))` | 0.0 ~ 2.0+ g | 低 < 0.3 / 中 0.3~0.8 / 高 > 0.8 |
| 動作平穩度 | `CV = std(mag) / mean(mag)` | 0.0 ~ 1.0+ | 平穩 < 0.3 / 普通 0.3~0.6 / 僵硬 > 0.6 |
| 身體穩定指數 | `1 − CV` | 0.0 ~ 1.0 | 穩定 ≥ 0.7 / 尚可 ≥ 0.4 / 不穩 < 0.4 |

### 7.2 後端分析指標（需音樂參考）

| 指標 | 檔案 | 演算法 |
|------|------|--------|
| 節奏同步率 | `analysis/rhythm.py` | 動作波峰 vs 音樂拍點時間差 |
| 凍結反應時間 | `analysis/freeze_dance.py` | RMS 能量下降 → 動作停止時間 |
| 凍結穩定指數 | `analysis/freeze_dance.py` | 停止後動作變異係數 |
| 綜合評分 | `analysis/metrics.py` | 5 項加權（參與度30% + 穩定20% + 節奏20% + 隊形15% + 流暢15%） |

### 7.3 燈號系統

| 分數區間 | 燈號 | 意義 |
|---------|------|------|
| ≥ 0.85 | 🟢 極佳 | 表現優異 |
| ≥ 0.70 | 🟡 良好 | 正常發展 |
| < 0.70 | 🔴 需關注 | 建議教師介入 |

---

## 8. API 參考

### 8.1 完整端點列表

#### 系統

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/health` | 健康檢查 |

#### 認證（Auth）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/auth/login` | 登入（body: `email`, `password`）→ 回傳 JWT |
| `POST` | `/api/auth/refresh` | 刷新 Token |
| `GET` | `/api/auth/me` | 當前使用者資訊 |
| `POST` | `/api/auth/register` | 註冊使用者（body: `email`, `password`, `display_name`, `role`, `org_id`） |
| `POST` | `/api/auth/complete-invite` | 完成邀請流程（body: `token`, `password`） |

#### Sessions（課程管理）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/sessions` | 列出課程（支援 `?status=`, `?class_id=` 篩選） |
| `POST` | `/api/sessions` | 建立課程（body: `name`, `class_id?`, `template_id?`, `description?`, `scheduled_at?`） |
| `GET` | `/api/sessions/{id}` | 課程詳情（含 template_activities, assignments） |
| `PUT` | `/api/sessions/{id}` | 更新課程（body: `name?`, `description?`, `class_id?`, `template_id?`, `scheduled_at?`） |
| `DELETE` | `/api/sessions/{id}` | 刪除課程（draft 狀態） |
| `POST` | `/api/sessions/{id}/start` | 開始上課（status→active, start_time=now） |
| `POST` | `/api/sessions/{id}/end` | 結束課程（status→completed, end_time=now） |
| `PUT` | `/api/sessions/{id}/activity` | 更新活動進度（body: `current_activity_index`） |
| `POST` | `/api/sessions/{id}/music` | 上傳音樂檔或設定 BPM（form: `file` 或 body: `bpm`）→ 自動分析 beat/stop times |
| `DELETE` | `/api/sessions/{id}/music` | 移除音樂設定 |
| `POST` | `/api/sessions/{id}/music-url` | 設定外部音樂連結（body: `url`, `track_name`, `album`） |
| `GET` | `/api/sessions/{id}/analysis` | Session 分析結果 |
| `GET` | `/api/sessions/{id}/evaluations` | 課程評分列表（含幼兒姓名） |
| `PUT` | `/api/sessions/{id}/evaluations/{childId}` | 儲存評分（body: `score?`, `comment?`） |
| `GET` | `/api/sessions/{id}/report` | 課程報告（sessions 彙整 + 評分） |
| `GET` | `/api/sessions/{id}/sessions` | 子 Session 列表 |

#### 教案模板（Templates）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/templates` | 列出所有模板 |
| `POST` | `/api/templates` | 新增模板（body: `name`, `description?`, `duration_minutes?`, `stages?`, `metrics_config?`） |
| `GET` | `/api/templates/{id}` | 模板詳情 |
| `PUT` | `/api/templates/{id}` | 更新模板 |
| `DELETE` | `/api/templates/{id}` | 刪除模板 |

#### 評估計算（Assessments）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/sessions/{id}/assessments/compute` | 批次計算 IMU 指標（activity/smoothness/stability）+ 音樂元素分析 |
| `GET` | `/api/sessions/{id}/assessments` | 取得 Session 評估結果 |
| `GET` | `/api/children/{id}/assessments` | 幼兒跨 Session 評估歷史 |
| `GET` | `/api/children/{id}/analysis/trends` | 幼兒逐音樂元素分析趨勢 |
| `GET` | `/api/classes/{id}/assessments` | 班級評估彙整 |

#### 系統設定

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/config/wifi` | 讀取 WiFi 設定（支援 `device_id` 參數，預設只回傳 `ssid` 與 `updated_at`） |
| `PUT` | `/api/config/wifi` | 更新 WiFi 設定（body: `ssid`, `password?`, `device_id?`） |
| `GET` | `/api/config/session?device_id=<device_id>` | 查詢裝置被指派到的 session（回傳 `{"session_id": "..."}` 或 `null`） |

#### 裝置與學員管理

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/devices` | 列出所有裝置 |
| `POST` | `/api/devices` | 註冊/更新裝置（body: `device_id`, `name?`, `firmware_version?`） |
| `PUT` | `/api/devices/{id}` | 更新裝置（body: `name?`, `org_id?`） |
| `GET` | `/api/children` | 列出所有學員 |
| `POST` | `/api/children` | 註冊學員（body: `name`, `student_id?`, `notes?`, `class_id?`） |
| `PUT` | `/api/children/{id}` | 更新學員資料 |
| `DELETE` | `/api/children/{id}` | 刪除學員 |
| `GET` | `/api/children/assignments` | 學員配對總覽（含 device_name） |
| `PUT` | `/api/children/{id}/assign` | 手動指定學員裝置（body: `device_id`） |
| `DELETE` | `/api/assignments/{id}` | 刪除配對 |
| `GET` | `/api/sessions/{id}/assignments` | 查詢配對結果 |
| `POST` | `/api/sessions/{id}/assign` | 執行裝置-學員配對（body: `device_id`, `child_id`, `confidence?`），`method` 固定為 `manual` |
| `POST` | `/api/sessions/{id}/auto-pair` | 跨模態自動配對（FFT 相位匹配 + Hungarian 指派） |

#### 韌體 OTA

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/firmware/upload` | 上傳新韌體（form: `version`, `description?`, `file`） |
| `GET` | `/api/firmware/list` | 列出所有版本 |

> **註**：OTA 版本檢查已改用 GitHub Pages 靜態檔案（`https://HMEAYC.github.io/NSTC/ota/version.json`），後端僅保留上傳與列表功能。

#### 影片分析

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/analyze/analyze` | 提交影片分析任務（body: `video_path`, ...） |
| `GET` | `/api/analyze/tasks` | 列出任務 |
| `GET` | `/api/analyze/tasks/{id}` | 任務狀態 |
| `POST` | `/api/analyze/tasks/{id}/cancel` | 取消任務 |

#### 報告（Reports）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/reports/{id}` | 取得單一報告 |

#### 組織管理（super_admin）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/admin/orgs` | 列出所有組織 |
| `POST` | `/api/admin/orgs` | 新增組織（body: `name`, `code`, `contact_email?`） |
| `PUT` | `/api/admin/orgs/{id}` | 更新組織資訊 |
| `DELETE` | `/api/admin/orgs/{id}` | 停用組織 |

#### 班級管理（org_admin / teacher）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/orgs/{orgId}/classes` | 班級列表 |
| `POST` | `/api/orgs/{orgId}/classes` | 新增班級（body: `name`, `grade?`） |
| `PUT` | `/api/classes/{id}` | 編輯班級（body: `name?`, `grade?`） |
| `DELETE` | `/api/classes/{id}` | 刪除班級 |
| `GET` | `/api/classes/{id}/children` | 班級幼兒列表 |
| `POST` | `/api/classes/{id}/children` | 新增幼兒到班級 |

#### 使用者管理（org_admin）

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/orgs/{orgId}/users` | 列出組織使用者 |
| `POST` | `/api/orgs/{orgId}/invite` | 邀請使用者加入組織（body: `email`, `role`） |
| `PUT` | `/api/users/{id}` | 編輯使用者（body: `is_active?`, `display_name?`） |

#### 家長綁定

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/api/orgs/{orgId}/parents` | 列出組織家長 |
| `GET` | `/api/children/{childId}/parents` | 查詢幼兒的家長 |
| `POST` | `/api/children/{childId}/parents` | 綁定家長（body: `parent_id`） |
| `GET` | `/api/parents/me/children` | 家長查看自己的幼兒 |
| `DELETE` | `/api/parents/{parentId}/children/{childId}` | 解除綁定 |

#### 合規（IRB / 審計 / 匯出）

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/consent` | 上傳家長同意書（form: `child_id`, `parent_id`, `consented`, `file?`） |
| `GET` | `/api/consent/{childId}` | 查詢幼兒同意書狀態 |
| `GET` | `/api/admin/audit-logs` | 審計日誌列表 |
| `POST` | `/api/admin/export/anonymized` | 匿名化資料匯出（body: `format=json/csv`） |
| `GET` | `/api/admin/export/anonymized` | 匿名化資料匯出（query: `format=json`） |
| `GET` | `/api/admin/export/consent-report` | 同意書報表 CSV |

#### WebSocket

| Protocol | Path | 說明 |
|----------|------|------|
| `WS` | `/ws/{session_id}?token=` | IMU 即時串流（ESP32 → Server → Dashboard broadcast）；支援選填 JWT token 驗證 |

### 8.2 WebSocket 資料格式

**ESP32 → Server：**
```json
{
  "type": "imu",
  "ts": 1719812345678,
  "device_id": "esp32-c3",
  "ax": 0.12, "ay": -0.05, "az": 1.02,
  "gx": 0.5, "gy": -1.2, "gz": 0.3
}
```

**Server → Dashboard（broadcast）：**
```json
{
  "type": "imu",
  "ts": 1719812345678,
  "device_id": "esp32-c3",
  "ax": 0.12, "ay": -0.05, "az": 1.02,
  "gx": 0.5, "gy": -1.2, "gz": 0.3
}
```

---

## 9. 驗證方法

### 9.1 單元測試

```bash
cd backend && python3 -m pytest tests/test_basic.py -v
# 預期：22 passed
```

測試項目：
- 健康檢查、路由數量、DB URL（3 項）
- 韌體路由（1 項）
- 節奏分析（2 項）
- Freeze Dance 分析（2 項）
- 臉部嵌入（2 項）
- Gemini fallback（1 項）
- API Key 驗證（3 項）
- WiFi 設定路由與模型（3 項）
- Session 模型與路由（3 項）
- Report 模型欄位（1 項）
- 完整路由覆蓋（1 項，含所有 19 條路由）

### 9.2 API 整合測試

```bash
bash field-testing/verify-device-management.sh
```

17 項測試通過標準（第 16-17 項僅在 Dashboard 已啟動時執行）：
1. ✅ 裝置列表（≥0 筆）
2. ✅ 註冊腰帶（回傳 online）
3. ✅ 註冊第二條腰帶
4. ✅ 心跳更新版本
5. ✅ 裝置列表 ≥ 2 筆
6. ✅ 註冊小明
7. ✅ 註冊小華
8. ✅ 學員列表 ≥ 2 筆
9. ✅ 建立課程（回傳 UUID）
10. ✅ 配對腰帶→小明
11. ✅ 配對腰帶→小華
12. ✅ 查詢配對（2 筆，顯示名稱與信心）
13. ✅ 覆寫配對（腰帶 A 改配小華）
14. ✅ 不存在裝置回傳 404
15. ✅ 不存在 Session 回傳 404
16. ✅ Dashboard 裝置管理頁面回傳 200
17. ✅ Dashboard 評估指標頁面回傳 200

### 9.3 ESP32 開機驗證

```bash
# 1. 確認 Serial log
idf.py -p /dev/cu.usbmodem1101 monitor

# 預期輸出順序：
MPU6xxx: WHO_AM_I verified: 0x70      ← IMU 偵測成功
MPU6xxx: MPU6xxx initialized           ← IMU 初始化完成
HMEAYC: WiFi connected, IP: 192.168.x.x  ← WiFi 連線成功
HMEAYC: WebSocket connected            ← WS 連線成功
DeviceRegistry: device registration succeeded  ← 裝置註冊成功
HMEAYC: checking remote session config...     ← 查詢 session 指派
HMEAYC: session config: {"session_id":"..."}  ← 取得 session 指派
WSClient: session changed: 'default' -> '...' ← 重連到正確 session

# 2. 確認 Dashboard 收到資料
# 開啟 http://localhost:5173/dashboard/live/<session_id>
# 確認圖表有即時波形

# 3. 確認裝置已註冊
open http://localhost:5173/dashboard/devices
# 應看到該 ESP32 列在裝置列表中（status=online）
```

### 9.4 端到端資料流驗證

```bash
# 1. ESP32 開機 → WS 資料流入
# 2. Dashboard LiveView 顯示即時圖表
# 3. Dashboard Assessment 顯示即時指標
# 4. 資料庫有 IMU 資料
psql -h localhost -U hmeayc -d hmeayc -c "SELECT COUNT(*) FROM imu_data;"
# 5. 裝置自動註冊
curl -s http://localhost:8000/api/devices | python3 -m json.tool
```

---

## 10. 疑難排解

### 10.1 後端無法啟動

```
Error: That port is already in use
```

```bash
# 釋放 8000 連接埠
lsof -ti:8000 | xargs kill
```

### 10.2 PostgreSQL 連線失敗

```
psql: connection to server at "localhost" (::1), port 5432 failed
```

```bash
# 確認 Docker 容器運行中
docker compose ps

# 重啟資料庫
docker compose restart db

# 確認連線資訊
docker compose exec db psql -U hmeayc -d hmeayc -c "SELECT 1"
```

### 10.3 ESP32 無法連線 WiFi

```
E (1000) wifi: wifi firmware version: c3_73bc60a
E (1000) wifi: wifi_task: rc=30720
```

```bash
# 檢查 sdkconfig 中的 SSID / 密碼
grep -E "CONFIG_HMEAYC_WIFI_SSID|CONFIG_HMEAYC_WIFI_PASSWORD" firmware/sdkconfig.defaults

# 確認路由器 2.4GHz 頻段已開啟
# ESP32-C3 不支援 5GHz
```

### 10.4 ESP32 WS 連線失敗

```
E (2000) HMEAYC: WebSocket connection failed
```

```bash
# 確認後端正執行中
curl http://localhost:8000/health

# 確認 ESP32 設定的 WS URI 正確
# sdkconfig.defaults 中：CONFIG_HMEAYC_WS_URI="ws://{BACKEND_IP}:8000/ws/default"
# 韌體會自動替換 session 路徑（透過 GET /api/config/session 查詢）

# 確認裝置已被指派到某個 session
curl -s "http://localhost:8000/api/config/session?device_id=hmeayc-001"

# 從 ESP32 ping 後端 IP
ping 192.168.1.105
```

### 10.5 MPU6500 偵測不到

```
I (100) MPU6xxx: MPU6500 not found (WHO_AM_I=0x00)
```

```bash
# 檢查 I2C 接線
# SDA → GPIO6, SCL → GPIO7, VCC → 3.3V, GND → GND

# 確認 I2C 位址（預設 0x68，AD0=GND）
# 若 AD0=3.3V，位址為 0x69
```

### 10.6 Dashboard 白畫面

```bash
# 檢查瀏覽器 console 錯誤
# 常見原因：API 回傳非 JSON 格式

# 確認後端 API 正常
curl http://localhost:8000/api/sessions

# 清除 node_modules 重新安裝
cd dashboard && rm -rf node_modules && npm install
```

### 10.7 韌體燒錄失敗

```
A fatal error occurred: Failed to connect to ESP32-C3: No serial data received
```

```bash
# 檢查連接埠
ls /dev/cu.usbmodem*

# 按住 BOOT 按鈕，再按一下 RESET，放開 BOOT
# 然後執行
idf.py -p /dev/cu.usbmodem1101 flash
```

### 10.8 裝置未顯示在 Dashboard

```bash
# 手動檢查 API
curl -s http://localhost:8000/api/devices

# 如果列表為空，手動註冊
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-001","name":"腰帶測試","firmware_version":"v0.1.0"}'

# 檢查 ESP32 是否有發送 POST /api/devices（開機與定期心跳）
```

### 10.9 Dashboard 或 Backend 無故停止

```bash
# 檢查進程是否在運行
lsof -ti:5173    # Dashboard
lsof -ti:8000    # Backend

# 重啟背景服務
make stop && make start

# 查看 log
cat /tmp/hmeayc-backend.log | tail -30
cat /tmp/hmeayc-dashboard.log | tail -30

# 改用分開 terminal 執行（log 即時顯示，不會意外退出）
make dev-backend   # terminal 1
make dev-dashboard # terminal 2
```

---

## 附錄 A：資料庫模型

```mermaid
erDiagram
    Session ||--o{ IMUData : has
    Session ||--o{ AnalysisResult : has
    Session ||--o{ Report : has
    Session ||--o{ DeviceAssignment : has
    Device ||--o{ DeviceAssignment : assigned_to
    Child ||--o{ DeviceAssignment : identified_as

    Session {
        string id PK
        enum course_type
        enum status
        datetime start_time
        datetime end_time
        json child_info
    }

    Device {
        string id PK
        string device_id UK
        string name
        string firmware_version
        float battery_level
        enum status
        datetime last_seen
        string active_session_id FK  ← 目前指派的 session（動態更新）
    }

    Child {
        string id PK
        string name
        string student_id UK
        text notes
        datetime created_at
    }

    DeviceAssignment {
        string id PK
        string session_id FK
        string device_id FK
        string child_id FK
        float confidence
        string method
        datetime assigned_at
    }

    IMUData {
        bigint id PK
        string session_id FK
        datetime timestamp
        float accel_x, accel_y, accel_z
        float gyro_x, gyro_y, gyro_z
        string device_id
    }

    AnalysisResult {
        string id PK
        string session_id FK
        float rhythm_sync_rate
        float freeze_reaction_time
        float freeze_stability_score
    }

    Report {
        string id PK
        string session_id FK
        json content
        enum status
    }
```

## 附錄 B：常用指令速查

```bash
# === 啟動 ===
make start            # 背景啟動全部（PostgreSQL + Backend + Dashboard）
make stop             # 停止全部
make dev              # docker compose 全部啟動（前景）
make dev-backend      # 後端 (uvicorn, 前景)
make dev-dashboard    # Dashboard (vite, 前景)
docker compose up -d db   # 資料庫

# === 韌體 ===
cd firmware
idf.py build                            # 編譯
idf.py -p /dev/cu.usbmodem1101 flash     # 燒錄
idf.py -p /dev/cu.usbmodem1101 monitor   # Serial log

# === 測試 ===
make test-backend                       # pytest
make lint-dashboard                     # tsc
bash field-testing/verify-device-management.sh  # API 整合測試

# === API 操作 ===
curl http://localhost:8000/health                   # 健康檢查
curl http://localhost:8000/api/devices               # 裝置列表
curl http://localhost:8000/api/children              # 學員列表
curl http://localhost:8000/api/sessions              # 課程列表

# === 資料庫 ===
psql -h localhost -U hmeayc -d hmeayc -c "SELECT count(*) FROM imu_data;"
psql -h localhost -U hmeayc -d hmeayc -c "SELECT * FROM devices;"
psql -h localhost -U hmeayc -d hmeayc -c "SELECT * FROM device_assignments;"
```
