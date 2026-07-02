# HMEAYC 整體開發設計規劃書

> 即時 AI 音樂學習工具之研發、實作與成效評估：支持幼兒整合性發展
>
> Real-time AI Music Learning Tool: Development, Implementation, and Evaluation
> for Promoting Early Childhood Integrated Development

- **執行單位**：朝陽科技大學
- **計畫主持人**：李玲玉教授
- **技術路線**：A 方案（ESP32-C3 + MPU6500 IMU + Edge AI + Gemini）
- **執行期間**：2026/08/01 ～ 2027/07/31

---

## 目錄

1. [專案概述](#1-專案概述)
2. [系統架構](#2-系統架構)
3. [硬體設計](#3-硬體設計)
4. [韌體設計](#4-韌體設計)
5. [後端設計](#5-後端設計)
6. [前端設計](#6-前端設計)
7. [API 規範](#7-api-規範)
8. [資料庫 Schema](#8-資料庫-schema)
9. [分析演算法說明](#9-分析演算法說明)
10. [開發時程與里程碑](#10-開發時程與里程碑)
11. [部署規劃](#11-部署規劃)

---

## 1. 專案概述

### 1.1 專案目標

本專案旨在研發一套**即時 AI 音樂學習工具**，以 HMEAYC（幼兒音樂與動作整合性發展）核心理論為基礎，透過穿戴式 IMU 感測器、Edge AI 分析與大型語言模型（Gemini），實現對幼兒音樂律動活動的量化評估與自動化報告生成。

### 1.2 解決的問題

- 傳統幼兒音樂教學依賴教師主觀觀察，缺乏客觀量化數據
- 人工記錄與分析耗時費力，無法即時回饋
- 跨場域、跨時間的長期追蹤難以實現
- 家長溝通缺乏具體數據佐證

### 1.3 核心功能

| 功能 | 說明 |
|------|------|
| IMU 即時感測 | 穿戴式裝置蒐集幼兒肢體加速度與角速度（50Hz） |
| 節奏同步分析 | 計算幼兒動作與音樂節拍的對齊誤差 |
| Freeze Dance 分析 | 偵測音樂停止時的身體控制穩定性 |
| 群體巨觀分析 | 隊形分類、熱區分佈、參與度評估 |
| 身分辨識與追蹤 | 跨影片長期累積個別幼兒發展軌跡 |
| AI 教育報告 | Gemini / OpenAI 自動生成教學建議 |
| Dashboard 視覺化 | 即時圖表 + 歷史查詢 + 報告預覽 |

---

## 2. 系統架構

### 2.1 整體架構圖

```mermaid
graph TB
    subgraph Wearable["穿戴式感測器 (ESP32-C3)"]
        IMU[MPU6500<br/>Accel + Gyro]
        MCU[ESP32-C3<br/>WiFi + WebSocket]
        BAT[雙電池供電<br/>LiPo 402030 + 14500]
        IMU -->|I2C 400kHz| MCU
        BAT --> MCU
    end

    subgraph Backend["後端伺服器 (FastAPI)"]
        WS[WebSocket<br/>即時串流]
        REST[REST API<br/>任務管理]
        ORM[SQLAlchemy<br/>PostgreSQL]
        ANALYSIS[分析引擎<br/>節奏/Freeze Dance/巨觀/微觀]
        GEMINI[Gemini / OpenAI<br/>報告生成]
        WS --> ANALYSIS
        REST --> ANALYSIS
        ANALYSIS --> ORM
        ANALYSIS --> GEMINI
    end

    subgraph Management["裝置與學員管理"]
        DEV[Device<br/>ESP32 腰帶註冊]
        CHILD[Child<br/>學員資料]
        ASSIGN[DeviceAssignment<br/>跨模態配對記錄]
    end

    subgraph Frontend["前端 Dashboard (React + Vite)"]
        LV[LiveView<br/>即時 IMU 圖表]
        HIST[History<br/>歷史查詢]
        REP[Report<br/>報告預覽]
        AI[AssessmentIndicators<br/>評估指標總覽]
        DM[DeviceManagement<br/>裝置/學員管理]
    end

    MCU -->|WebSocket JSON| WS
    MCU -->|POST /api/devices| REST
    REST --> DEV
    REST --> CHILD
    REST --> ASSIGN
    ASSIGN --> ORM

    subgraph Pipeline["影片分析管線 (CLI / API)"]
        VIDEO[影片輸入<br/>.mp4]
        YOLO[YOLOv8-pose<br/>人體偵測]
        MP[MediaPipe<br/>姿勢精化]
        TRACK[ByteTrack<br/>多人追蹤]
        MACRO[巨觀分析<br/>隊形/熱區/參與度]
        MICRO[微觀分析<br/>節奏/穩定/流暢]
        METRIC[指標燈號<br/>綜合評分]
        PDF[PDF 報告<br/>weasyprint]
        VIDEO --> YOLO
        YOLO --> MP
        YOLO --> TRACK
        MP --> MICRO
        TRACK --> MICRO
        MICRO --> MACRO
        MICRO --> METRIC
        MACRO --> METRIC
        METRIC --> PDF
    end

    Wearable -->|WiFi + JSON| WS
    Frontend -->|HTTP + WebSocket| REST
    Frontend --> WS
    Pipeline -->|CSV / JSON| ORM
```

### 2.2 Monorepo 目錄結構

```
HMEAYC/
├── .opencode/                   # opencode 設定與規劃
├── .gitignore
├── Makefile                     # 常用指令快捷
├── docker-compose.yml           # 整合開發環境
├── README.md
│
├── backend/                     # FastAPI 後端
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── app/
│       ├── __init__.py          # 版本號
│       ├── __main__.py          # CLI entry
│       ├── main.py              # FastAPI app
│       ├── cli.py               # 命令列解析
│       ├── config.py            # 設定檔
│       ├── paths.py             # 目錄路徑管理
│       ├── pipeline.py          # 完整分析管線
│       ├── timecode.py          # 時間碼工具
│       ├── viz.py               # 圖表繪製
│       ├── api/                 # REST + WebSocket
│       │   ├── video_analysis.py    # 影片分析 API
│       │   ├── sessions.py      # Session API
│       │   └── ws.py            # IMU WebSocket
│       ├── analysis/            # 分析引擎
│       │   ├── macro.py         # 巨觀分析
│       │   ├── micro.py         # 微觀分析
│       │   ├── metrics.py       # 指標計算
│       │   ├── rhythm.py        # 節奏分析 stub
│       │   ├── freeze_dance.py  # Freeze Dance stub
│       │   └── pose/            # 姿勢精化
│       │       ├── common.py
│       │       ├── estimator.py # MediaPipe Pose
│       │       └── holistic.py  # MediaPipe Holistic
│       ├── tracking/            # 身分辨識
│       │   ├── identity.py      # 外觀嵌入 + 身分庫
│       │   ├── face_insight.py  # ArcFace stub
│       │   ├── longitudinal.py  # 跨影片累積
│       │   └── importer.py      # 批次匯入
│       ├── report/              # 報告生成
│       │   ├── advisor.py       # 教育建議模板
│       │   ├── ai_edu.py        # LLM 補充
│       │   ├── pdf.py           # PDF 輸出
│       │   └── student.py       # 個人長期報告
│       ├── ingest/              # 影片輸入
│       │   ├── video.py         # OpenCV + librosa
│       │   └── segment.py       # ffmpeg 裁切
│       ├── gemini/              # Gemini 整合
│       │   ├── client.py
│       │   └── prompts.py
│       ├── models/              # SQLAlchemy ORM
│       │   ├── session.py
│       │   ├── imu_data.py
│       │   ├── analysis_result.py
│       │   └── report.py
│       └── db/                  # DB 連線
│           ├── __init__.py
│           └── base.py
│
├── dashboard/                   # React 前端
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── LiveView.tsx     # 即時 IMU 圖表
│       │   ├── History.tsx      # 歷史紀錄
│       │   └── Report.tsx       # 報告檢視
│       ├── hooks/
│       │   └── useWebSocket.ts  # WebSocket Hook
│       └── api/
│           └── client.ts        # REST client
│
├── firmware/                    # ESP32-C3 韌體
│   ├── CMakeLists.txt
│   ├── Kconfig.projbuild
│   └── main/
│       ├── CMakeLists.txt
│       ├── main.c               # app_main
│       ├── imu_driver.c / .h    # MPU6500 I2C
│       ├── wifi_manager.c / .h  # WiFi + 重連
│       └── websocket_client.c / .h  # WS 上傳
│
├── hardware/                    # 硬體設計
│   ├── README.md                # 方塊圖 + BOM
│   ├── schematic.md             # 電路圖
│   └── pcb_layout.md            # PCB 佈局
│
├── field-testing/               # 場域測試（預留）
│
└── docs/                        # 文件
    └── agents/                  # Agent 說明文件
```

---

## 3. 硬體設計

### 3.1 系統方塊圖

```mermaid
graph LR
    subgraph Power["電源系統"]
        USB[USB-C 5V]
        IP2362A[IP2362A<br/>充電 IC<br/>R_PROG=12kΩ]
        LIPO[LiPo 402030<br/>200mAh 3.7V]
        EXT14500[外部 14500<br/>800mAh 1.5V]
        D1[SS12<br/>Schottky]
        D2[SS12<br/>Schottky]
        ME6211[ME6211C33M5G<br/>3.3V LDO]
    end

    subgraph MCU["主控"]
        ESP[ESP32-C3<br/>GPIO19/20 native USB]
    end

    subgraph Sensors["感測器"]
        MPU[MPU6500<br/>I2C addr 0x68]
        WS2812[WS2812B<br/>GPIO8]
        BAT_ADC[電壓分壓<br/>GPIO0<br/>100kΩ/47kΩ]
    end

    subgraph IO["使用者介面"]
        BTN[BOOT Button<br/>GPIO9]
        RST[RST RC circuit<br/>10kΩ + 100nF]
    end

    USB --> IP2362A
    IP2362A --> LIPO
    LIPO --> D1
    EXT14500 --> D2
    D1 --> ME6211
    D2 --> ME6211
    ME6211 --> ESP
    ME6211 --> MPU
    ME6211 --> WS2812
    ESP -->|GPIO6 SDA, GPIO7 SCL| MPU
    ESP --> WS2812
    ESP --> BAT_ADC
    ESP --> BTN
    ESP --> RST
```

### 3.2 電源設計

| 項目 | 規格 |
|------|------|
| 內部電池 | LiPo 402030 200mAh 3.7V |
| 外部電池 | 14500 800mAh 1.5V（裝入擴充座） |
| 充電 IC | IP2362A（R_PROG=12kΩ ⇒ ~100mA） |
| 二極體 OR-ing | SS12 Schottky（D1/D2），自動選擇電壓較高者 |
| LDO | ME6211C33M5G，dropout ~200mV@100mA |
| 可運作電壓範圍 | 4.2V ~ 3.35V（約 80% 電量） |
| 續航估算 | 內部電池：~1.5h；外部 14500：~6h |

### 3.3 接腳分配

| GPIO | 功能 | 備註 |
|------|------|------|
| GPIO6 | I2C SDA | MPU6500 data line |
| GPIO7 | I2C SCL | MPU6500 clock line (400kHz) |
| GPIO0 | ADC | 電池電壓分壓（100kΩ/47kΩ） |
| GPIO8 | WS2812B | NeoPixel 狀態指示燈 |
| GPIO9 | BOOT Button | 啟動模式選擇 + 使用者輸入 |
| GPIO19 | USB D- | Native USB |
| GPIO20 | USB D+ | Native USB |
| EN | RST RC | 10kΩ pull-up + 100nF to GND |

### 3.4 PCB 規格

| 項目 | 規格 |
|------|------|
| 尺寸 | 45mm × 35mm |
| 層數 | 2 層 |
| 最小線寬/線距 | 6mil / 6mil |
| 銅厚 | 1oz |
| 表面處理 | HASL (無鉛) |
| 特殊要求 | 天線禁制區、Via stitching 接地 |
| 預計打樣廠 | JLCPCB / PCBWay |

### 3.5 BOM 估算

| 零件 | 單價 (NTD) | 數量 | 小計 |
|------|-----------|------|------|
| ESP32-C3-MINI-1 模組 | 150 | 1 | 150 |
| MPU6500 | 35 | 1 | 35 |
| IP2362A + 被動元件 | 25 | 1 | 25 |
| ME6211C33M5G | 8 | 1 | 8 |
| SS12 Schottky | 3 | 2 | 6 |
| 402030 200mAh LiPo | 90 | 1 | 90 |
| USB-C 母座 | 8 | 1 | 8 |
| WS2812B | 15 | 1 | 15 |
| 電阻電容 (0402) | 0.5 | ~20 | 10 |
| PCB 打樣 (10pcs 分攤) | 60 | 1 | 60 |
| 其他（按鍵、排針等） | 30 | 1 | 30 |
| **單片合計** | | | **~437** |
| **10 片合計** | | | **~4,370** |

---

## 4. 韌體設計

### 4.1 技術棧

- **框架**：ESP-IDF v5.x（官方 ESP32-C3 支援）
- **語言**：C11
- **建置系統**：CMake + idf.py

### 4.2 專案結構

```
firmware/
├── CMakeLists.txt           # 頂層 CMake
├── Kconfig.projbuild        # 選單式設定（SSID/Password/URI）
├── partitions.csv           # 分割表
├── sdkconfig                # ESP-IDF 設定
└── main/
    ├── CMakeLists.txt       # 元件 CMake
    ├── main.c               # app_main：初始化 + 主迴圈
    ├── imu_driver.c /.h     # MPU6500 I2C 驅動
    ├── wifi_manager.c /.h   # WiFi 事件處理 + 自動重連
    └── websocket_client.c /.h # WebSocket 上傳
```

### 4.3 MPU6500 驅動

**初始化序列（`mpu6050_init`）：**

1. 喚醒：寫 `0x00` 到 `PWR_MGMT_1` (0x6B)
2. 等待 100ms 歸位
3. 設定 DLPF：寫 `0x03` 到 `CONFIG` (0x1A) ⇒ 44Hz 低通
4. 設定取樣率：寫 `19` 到 `SMPLRT_DIV` (0x19) ⇒ 1000 / (1+19) = 50Hz
5. 設定陀螺儀 ±250dps：寫 `0x00` 到 `GYRO_CONFIG` (0x1B)
6. 設定加速度 ±2g：寫 `0x00` 到 `ACCEL_CONFIG` (0x1C)

**資料讀取（`mpu6050_read_all`）：**

- Burst read 14 bytes from `ACCEL_XOUT_H` (0x3B)
- Big-endian 解析：ax, ay, az, temp, gx, gy, gz
- 縮放因數：accel 16384 LSB/g, gyro 131 LSB/dps

**定時器：**

- ESP 定時器 20ms 週期（50Hz）
- 每個 tick：讀取 IMU → 格式化 JSON → WebSocket 發送

### 4.4 WiFi 管理

- 使用 `esp_event_handler` 監聽 `WIFI_EVENT` / `IP_EVENT`
- 連線成功 → 啟動 WebSocket
- 斷線（`WIFI_EVENT_STA_DISCONNECTED`）→ 自動重連（`esp_wifi_connect()`）
- SSID / Password / WebSocket URI 透過 Kconfig / menuconfig 設定

### 4.5 WebSocket 用戶端

- 使用 ESP-IDF `esp_websocket_client`
- JSON 格式上傳：

```json
{
  "device_id": "HMEAYC-001",
  "ts": 1234567890.123,
  "ax": 0.12, "ay": -0.05, "az": 1.02,
  "gx": 0.5, "gy": -1.2, "gz": 0.3
}
```

- 發送間隔：50Hz（每 20ms 一筆）
- 斷線重連：WiFi 恢復後自動重建 WebSocket 連線

### 4.6 Kconfig 參數

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `HMEAYC_WIFI_SSID` | — | WiFi SSID |
| `HMEAYC_WIFI_PASSWORD` | — | WiFi 密碼 |
| `HMEAYC_WS_URI` | `ws://192.168.1.100:8080/ws` | WebSocket URI |
| `HMEAYC_DEVICE_ID` | `HMEAYC-001` | 裝置識別碼 |

---

## 5. 後端設計

### 5.1 技術棧

| 組件 | 技術 | 說明 |
|------|------|------|
| Web Framework | FastAPI 0.115+ | REST + WebSocket |
| ASGI Server | Uvicorn 0.30+ | 生產級 ASGI |
| ORM | SQLAlchemy 2.0+ | 非同步 ORM |
| Driver | asyncpg 0.30+ | PostgreSQL 非同步驅動 |
| Migration | Alembic 1.13+ | Schema 版本控制 |
| AI | google-genai | Gemini API |
| AI (備用) | openai | OpenAI-compatible API |

### 5.2 應用模組

```
backend/app/
├── main.py                 # FastAPI app 啟動 + 路由掛載
├── config.py               # Pydantic Settings
├── paths.py                # 資料目錄管理
├── pipeline.py             # 完整分析管線（orchestrator）
├── cli.py                  # 命令列介面
├── viz.py                  # matploblib 圖表
├── timecode.py             # 時間碼工具
│
├── api/
│   ├── video_analysis.py   # POST /api/analyze/analyze
│   │                       # GET /api/analyze/tasks/{id}
│   │                       # GET /api/analyze/tasks
│   │                       # POST /api/analyze/tasks/{id}/cancel
│   ├── sessions.py         # Session CRUD API
│   └── ws.py               # WebSocket /ws (IMU 即時流)
│
├── analysis/
│   ├── rhythm.py           # 節奏同步分析 (stub → 實作)
│   ├── freeze_dance.py     # Freeze Dance 分析 (stub → 實作)
│   ├── macro.py            # 巨觀：隊形、熱區、參與度
│   ├── micro.py            # 微觀：同步誤差、穩定度、jerk
│   ├── metrics.py          # 指標燈號：綠/黃/紅
│   └── pose/
│       ├── estimator.py    # MediaPipe Pose 精化
│       ├── holistic.py     # MediaPipe Holistic 精化
│       └── common.py       # COCO17 轉換共用
│
├── tracking/
│   ├── identity.py         # 外觀嵌入（HSV histogram）+ 身分庫
│   ├── face_insight.py     # ArcFace stub（待 insightface）
│   ├── longitudinal.py     # JSONL 跨影片累積
│   └── importer.py         # 批次匯入既有 metrics
│
├── report/
│   ├── advisor.py          # 教育建議 Markdown 模板
│   ├── ai_edu.py           # LLM 補充段落
│   ├── pdf.py              # Markdown → PDF (weasyprint)
│   └── student.py          # 個人長期趨勢報告
│
├── ingest/
│   ├── video.py            # OpenCV 中繼資料 + librosa 音訊
│   └── segment.py          # ffmpeg 影片裁切
│
├── gemini/
│   ├── client.py           # Google GenAI 客戶端
│   └── prompts.py          # Prompt 模板
│
├── models/
│   ├── session.py          # Session ORM
│   ├── imu_data.py         # IMUData ORM
│   ├── analysis_result.py  # AnalysisResult ORM
│   └── report.py           # Report ORM
│
└── db/
    ├── __init__.py
    └── base.py             # 引擎 + SessionLocal
```

### 5.3 分析管線流程（pipeline.py）

```
run_full_pipeline(video_path, ...)
  │
  ├─ read_video_meta()           # OpenCV metadata
  ├─ [t0/t1] → export_video_segment()  # ffmpeg 裁切（選用）
  ├─ _identity_pass()            # 片中點身分推測
  ├─ macro_analytics.run_macro() # 巨觀分析
  │   ├─ YOLO 逐幀偵測
  │   ├─ 隊形分類（scatter/circle/line/cluster）
  │   ├─ 熱區 3×3 網格
  │   └─ 參與度（位移活躍比例）
  ├─ load_audio_mono()           # librosa 音訊
  ├─ micro_analytics.run_micro() # 微觀分析
  │   ├─ Beat tracking + stop signal detection
  │   ├─ YOLO + ByteTrack 多人追蹤
  │   ├─ MediaPipe 姿勢精化（選用）
  │   ├─ 節奏同步誤差（手腕拍點對齊）
  │   ├─ 停止信號位移（穩定度）
  │   └─ 髖部軌跡 jerk（流暢度代理）
  ├─ _merge_child_identities()   # 身分對齊
  ├─ metrics_checker.run_metrics()  # 燈號評分
  ├─ advisor.render_edu_markdown()  # 教育報告
  ├─ ai_edu.augment_edu_report()    # LLM 補充（選用）
  ├─ [--pdf] → export_markdown_pdf()
  └─ longitudinal.append_session()  # 跨影片累積
```

---

## 6. 前端設計

### 6.1 技術棧

| 組件 | 技術 |
|------|------|
| 框架 | React 18+ |
| 建置 | Vite 5+ |
| 語言 | TypeScript 5+ |
| 樣式 | Tailwind CSS 3+ |
| 圖表 | Recharts |
| WebSocket | 原生 WebSocket API |
| HTTP | fetch / axios |

### 6.2 頁面結構

```
dashboard/src/
├── main.tsx                # ReactDOM.createRoot
├── App.tsx                 # 路由 + 佈局
├── index.css               # Tailwind 匯入
│
├── pages/
│   ├── Landing.tsx              # 首頁導航（6 張卡片）
│   ├── LiveView.tsx             # 即時 IMU 曲線（Recharts）
│   ├── History.tsx              # 歷史 Session 列表 + 查詢
│   ├── Report.tsx               # 報告 Markdown/PDF 預覽
│   ├── AssessmentIndicators.tsx # 評估指標總覽（IMU/CV 即時運算）
│   └── DeviceManagement.tsx     # 裝置/學員管理與跨模態配對
│
├── hooks/
│   ├── useWebSocket.ts     # WS 連線管理 + 自動重連
│   └── useLiveMetrics.ts   # 即時 IMU 指標計算（jerk/activity/stability）
│
├── api/
│   └── client.ts           # REST API 封裝（sessions + devices + children）
│
├── components/
│   ├── ErrorBoundary.tsx   # 錯誤邊界
│   └── LoadingSpinner.tsx  # 載入動畫
│
└── types/
    └── index.ts            # TypeScript 型別定義
```

### 6.3 路由設計

| 路徑 | 頁面 | 說明 |
|------|------|------|
| `/dashboard/` | Landing | 首頁導航 |
| `/dashboard/live/:sessionId` | LiveView | 即時 IMU 儀表板 |
| `/dashboard/history` | History | 歷史 Session 列表 |
| `/dashboard/report/:sessionId` | Report | 單筆報告檢視 |
| `/dashboard/assessment/:sessionId` | AssessmentIndicators | 評估指標總覽 |
| `/dashboard/devices` | DeviceManagement | 裝置與學員管理 |

### 6.4 WebSocket Hook 設計

```typescript
// useWebSocket.ts 核心行為
- 連線：new WebSocket(ws://host:port/ws)
- 自動重連：斷線後 exponential backoff（1s, 2s, 4s, ..., max 30s）
- 訊息型別分派：
  - "imu"       → IMUChart 更新
  - "analysis"  → 分析結果更新
  - "status"    → 連線/分析狀態
- 清理：unmount 時 close()

// Vite proxy: /ws → ws://backend:8080/ws
```

---

## 7. API 規範

### 7.1 RESTful Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | 健康檢查 | — |
| `POST` | `/api/analyze/analyze` | 提交影片分析任務 | `X-API-Key` |
| `GET` | `/api/analyze/tasks` | 列出歷史任務 | `X-API-Key` |
| `GET` | `/api/analyze/tasks/{id}` | 查詢單一任務狀態 | `X-API-Key` |
| `POST` | `/api/analyze/tasks/{id}/cancel` | 取消任務 | `X-API-Key` |
| `GET` | `/api/sessions` | 列出 Session | — |
| `POST` | `/api/sessions` | 建立新 Session | — |
| `GET` | `/api/sessions/{id}` | 單一 Session 詳情 | — |
| `GET` | `/api/sessions/{id}/analysis` | Session 分析結果 | — |
| `POST` | `/api/sessions/{id}/report` | 產生報告 | — |
| `GET` | `/api/sessions/{id}/report` | Session 報告 | — |
| `GET` | `/api/reports/{id}` | 單一報告 | — |
| `GET` | `/api/devices` | 列出所有裝置 | — |
| `POST` | `/api/devices` | 註冊/更新裝置 | — |
| `GET` | `/api/children` | 列出所有學員 | — |
| `POST` | `/api/children` | 註冊學員 | — |
| `GET` | `/api/sessions/{id}/assignments` | 查詢配對結果 | — |
| `POST` | `/api/sessions/{id}/assign` | 執行裝置-學員配對 | — |
| `DELETE` | `/api/sessions/{id}` | 刪除 Session | `X-API-Key` |

### 7.2 WebSocket 協定（`/ws`）

**用戶端 → 伺服器（IMU 資料）：**

```json
{
  "type": "imu",
  "device_id": "HMEAYC-001",
  "ts": 1234567890.123,
  "ax": 0.12, "ay": -0.05, "az": 1.02,
  "gx": 0.5, "gy": -1.2, "gz": 0.3
}
```

**伺服器 → 用戶端（分析結果）：**

```json
{
  "type": "analysis",
  "session_id": "uuid",
  "timestamp": 1234567890.123,
  "rhythm_sync": { "ms": 45, "rating": "excellent" },
  "stability": { "cm": 3.2, "rating": "excellent" }
}
```

### 7.3 影片分析請求（POST `/api/analyze/analyze`）

```json
{
  "video_path": "/data/videos/session-001.mp4",
  "model": "yolov8n-pose.pt",
  "stride": 4,
  "pose": "pose",
  "learn_identities": false,
  "no_track": false,
  "t0": "00:30",
  "t1": "02:30",
  "no_ai": false,
  "pdf": false
}
```

**回應：**

```json
{
  "ok": true,
  "task_id": "a1b2c3d4e5f6...",
  "status": "queued"
}
```

---

## 8. 資料庫 Schema

### 8.1 ER 圖

```mermaid
erDiagram
    Session {
        uuid id PK
        text course_type
        text status
        timestamp start_time
        timestamp end_time
        jsonb child_info
    }

    Device {
        uuid id PK
        text device_id UK
        text name
        text firmware_version
        float battery_level
        text status
        timestamp last_seen
        timestamp created_at
    }

    Child {
        uuid id PK
        text name
        text student_id UK
        text notes
        timestamp created_at
    }

    DeviceAssignment {
        uuid id PK
        uuid session_id FK
        uuid device_id FK
        uuid child_id FK
        float confidence
        text method
        timestamp assigned_at
    }

    IMUData {
        bigint id PK
        uuid session_id FK
        timestamp ts
        float ax
        float ay
        float az
        float gx
        float gy
        float gz
    }

    AnalysisResult {
        uuid id PK
        uuid session_id FK
        timestamp created_at
        text type
        jsonb result
    }

    Report {
        uuid id PK
        uuid session_id FK
        timestamp created_at
        text report_type
        text markdown
        text pdf_path
    }

    Session ||--o{ IMUData : has
    Session ||--o{ AnalysisResult : has
    Session ||--o{ Report : has
    Session ||--o{ DeviceAssignment : has
    Device ||--o{ DeviceAssignment : assigned_to
    Child ||--o{ DeviceAssignment : identified_as
```

### 8.2 Table 定義

**Session：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | VARCHAR(36) | PK | UUID |
| course_type | ENUM | NOT NULL | march / car |
| child_info | JSONB | — | 學員補充資訊 |
| status | ENUM | default 'active' | active / completed |
| start_time | TIMESTAMPTZ | default now() | 開始時間 |
| end_time | TIMESTAMPTZ | — | 結束時間 |

**Device：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | VARCHAR(36) | PK | UUID |
| device_id | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | ESP32-C3 實體 ID |
| name | VARCHAR(100) | — | 顯示名稱（如「腰帶 A」） |
| firmware_version | VARCHAR(32) | — | 目前韌體版本 |
| battery_level | FLOAT | — | 0.0 ~ 1.0 |
| status | ENUM | default 'offline' | online / offline |
| last_seen | TIMESTAMPTZ | — | 最後心跳時間 |
| created_at | TIMESTAMPTZ | default now() | 註冊時間 |

**Child：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | VARCHAR(36) | PK | UUID |
| name | VARCHAR(100) | NOT NULL | 幼兒姓名 |
| student_id | VARCHAR(50) | UNIQUE | 學號 |
| notes | TEXT | — | 備註 |
| created_at | TIMESTAMPTZ | default now() | 建立時間 |

**DeviceAssignment：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | VARCHAR(36) | PK | UUID |
| session_id | VARCHAR(36) | FK → Session.id, NOT NULL | 所屬課程 |
| device_id | VARCHAR(36) | FK → Device.id, NOT NULL | 配對裝置 |
| child_id | VARCHAR(36) | FK → Child.id, NOT NULL | 配對學員 |
| confidence | FLOAT | — | 配對信心度 [0, 1] |
| method | VARCHAR(32) | default 'manual' | manual / cross_modal_fft |
| assigned_at | TIMESTAMPTZ | default now() | 配對時間 |

Unique: `(session_id, device_id)` — 同一課程中裝置不重複配對

**IMUData：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | BIGSERIAL | PK | 遞增 ID |
| session_id | UUID | FK → Session.id, NOT NULL | 所屬 Session |
| ts | DOUBLE PRECISION | NOT NULL | 裝置時間戳（epoch sec） |
| ax, ay, az | REAL | NOT NULL | 加速度（g） |
| gx, gy, gz | REAL | NOT NULL | 角速度（dps） |

Index: `(session_id, ts)` composite index for time-range queries.

**AnalysisResult：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PK | 唯一識別 |
| session_id | UUID | FK → Session.id, NOT NULL | 所屬 Session |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | 建立時間 |
| type | VARCHAR(32) | NOT NULL | rhythm / freeze_dance / macro / micro |
| result | JSONB | NOT NULL | 分析結果 JSON |

**Report：**

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PK | 唯一識別 |
| session_id | UUID | FK → Session.id, NOT NULL | 所屬 Session |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | 建立時間 |
| report_type | VARCHAR(32) | NOT NULL | daily / longitudinal |
| markdown | TEXT | — | Markdown 原始內容 |
| pdf_path | TEXT | — | PDF 檔案路徑 |

---

## 9. 分析演算法說明

### 9.1 節奏同步分析（rhythm.py）

**輸入：** IMU 加速度序列 + 音樂 BPM / beat times

**演算法：**

1. 對加速度三軸計算 magnitude：`mag = sqrt(ax² + ay² + az²)`
2. 帶通濾波（0.5Hz ~ 5Hz）去除直流與高頻噪聲
3. 偵測動作峰值（手腕加速度 local maxima）
4. 對比音樂節拍時間（librosa beat tracking）
5. 計算平均絕對誤差（ms）

**輸出：** `avg_error_ms` + 評級（<50ms 優秀 / <150ms 良好 / ≥150ms 需加強）

### 9.2 Freeze Dance 分析（freeze_dance.py）

**輸入：** IMU 加速度序列 + 音樂 RMS 能量

**演算法：**

1. 偵測 RMS 能量急降點（`rms[t-1] - rms[t] > threshold`）
2. 標記為停止信號時間
3. 計算信號後 0.5~1.0 秒內髖部位移量
4. 平均位移作為穩定度指標

**輸出：** `avg_displacement_cm` + 評級（<5cm 優秀 / <15cm 良好 / ≥15cm 需加強）

### 9.3 巨觀分析（macro.py）

**隊形分類：**
- 計算人物中心點集合的 PCA + 距離統計
- 分類：scatter（散落）、circle（圓形）、line（線列）、cluster（集群）
- 每 30 秒時間窗輸出一次

**熱區：**
- 3×3 網格歸一化計數
- 標記高頻（hotspot）與低頻（underused）區域

**參與度：**
- 逐幀人物框中心位移速度 > 0.5 cm/s 即標記為活躍
- 全片活躍幀比例 = engagement_score

### 9.4 微觀分析（micro.py）

**追蹤：**
- ByteTrack（ultralytics 內建）以 track_id 關聯跨幀同人物
- 無 tracking 時退化成由左至右槽位對齊

**姿勢精化（選用）：**
- YOLO 人框 → MediaPipe Pose / Holistic 33 點 → COCO 17×2

**流暢度代理（jerk）：**
- 對髖部軌跡三階差分：`jerk = d³x/dt³`
- 平均 jerk 值愈低代表動作愈流暢

### 9.5 身分辨識（tracking/identity.py）

**外觀嵌入：**
- BGR → HSV 轉換
- 4×4×4 三維直方圖（共 64 bins）
- L2 歸一化 → 128 維向量

**比對：**
- 餘弦相似度（cosine similarity）
- threshold ≥ 0.85 視為同一人

**資料庫：**
- `backend/memory/identity_features.db.json`
- 支援 ArcFace embedding（需安裝 insightface，目前為 stub）

### 9.6 指標燈號（metrics.py）

綜合五項指標加權：

| 指標 | 權重 | 資料來源 |
|------|------|---------|
| 群體參與度 | 30% | macro.engagement_score |
| 身體穩定度 | 20% | micro.avg_displacement_cm |
| 節奏同步 | 20% | micro.avg_error_ms |
| 隊形穩定性 | 15% | macro.formation_stability |
| 動作流暢度 | 15% | micro.avg_jerk |

**燈號門檻：**

| 綜合分 | 燈號 |
|--------|------|
| ≥ 0.85 | 🟢 極佳 |
| ≥ 0.70 | 🟡 良好 |
| < 0.70 | 🔴 需關注 |

### 9.7 跨模態裝置配對（Cross-Modal Belt Assignment）

**論文參考：** *"A Cross-Modal Child Identification Framework for AI-Assisted Music Learning Using Wearable IMU Sensors and Vision-Based Pose Estimation"* (Lee, Chen & Chen, 2026)

**問題：** N 個幼兒各戴一條 ESP32-C3 IMU 腰帶，需要自動匹配腰帶 → 幼兒，不依賴臉部辨識。

**核心洞察：** 對正弦律動而言，IMU 加速度與視覺髖部位移之間存在恆定 π 弧度相位差：
- 髖部位移：`y(t) = A sin(ω(t + φ))`
- 加速度（扣除重力）：`a(t) = −Aω² sin(ω(t + φ))`
- FFT 相位角：`∠IMU − ∠Vision ≈ π`（物理運動學恆等式）

**演算法（N²-Candidate Self-Calibrating）：**
```
1. 對每個 IMU 腰帶訊號做 FFT → φᵢᴵᴹᵁ (BPM 頻率 bin)
2. 對每個幼兒 MediaPipe 髖部軌跡做 FFT → φⱼᵛᴵˢ
3. 遍歷 N² 組候選偏移 C_{ij} = φᵢᴵᴹᵁ − φⱼᵛᴵˢ
4. 對每個 C_{ij} 建立距離矩陣，執行 Hungarian 指派
5. 選取總成本最小的指派 σ* 與偏移 C*
```

**信心分數：** `conf_i = 1 − (D[i, σ(i)] − minⱼ D[i,j]) / (maxⱼ D[i,j] − minⱼ D[i,j])`

**效能：**
- O(N⁵) 時間複雜度，支援 N ≤ 10 人即時運算
- 合成實驗（σ = 0.50 m/s², N = 3/5）：100% 準確率
- 估計偏移 C* ≈ 3.10 ± 0.04 rad（理論值 π = 3.14 rad）

**資料庫對應：**
- `DeviceAssignment` 表記錄配對結果（session_id, device_id, child_id, confidence, method）
- `POST /api/devices` 自動註冊 ESP32 腰帶
- `POST /api/sessions/{id}/assign` 觸發配對演算法

---

## 10. 開發時程與里程碑

### 10.1 甘特圖

```mermaid
gantt
    title HMEAYC 開發時程與里程碑
    dateFormat  YYYY-MM
    axisFormat  %Y-%m

    section 準備期
    採購下單 + 韌體開工         :active, 2026-06, 2026-08
    IRB 文件準備                :active, 2026-06, 2026-09

    section 核心開發
    硬體打樣 + 基本測試         :2026-07, 2026-08
    韌體 IMU 驅動 + WiFi + WS  :2026-07, 2026-08
    Backend 分析引擎實作         :2026-08, 2026-09
    Dashboard UI 開發            :2026-08, 2026-09
    端到端整合測試               :2026-09, 2026-10

    section 里程碑
    採購完成 + 韌體基礎完成     :milestone, 2026-07, 1d
    AI 分析完成                 :milestone, 2026-08, 1d
    IRB 送審                    :milestone, 2026-09, 1d
    Dashboard 完成               :milestone, 2026-09, 1d
    MVP 完成                    :milestone, 2026-10, 1d

    section 場域與正式版
    IRB 審查期間                :2026-09, 2027-01
    場域測試 (IRB 核准後)        :2026-11, 2027-01
    場域回饋迭代 + 正式版        :2027-02, 2027-06
    正式版完成                   :milestone, 2027-06, 1d
    結案                        :milestone, 2027-07, 1d
```

### 10.2 MVP 範圍（2026/10）

| 項次 | 項目 | 狀態 |
|------|------|------|
| M1 | ESP32-C3 + MPU6500 IMU 可上傳 50Hz 資料 | ✅ 韌體完成 |
| M2 | FastAPI WebSocket 可接收 IMU 並寫入 DB | ✅ 後端完成 |
| M3 | 巨觀分析（隊形 + 熱區 + 參與度） | ✅ 完成 |
| M4 | 微觀分析（節奏 + 穩定 + 流暢） | ✅ 完成 |
| M5 | 指標燈號 + 教育報告 Markdown | ✅ 完成 |
| M6 | Dashboard LiveView + History + Report | ✅ 完成 |
| M7 | Docker Compose 一鍵啟動 | ✅ 完成 |
| M8 | CLI 指令可跑完整分析管線 | ✅ 完成 |

### 10.3 團隊分工

| 成員 | 角色 | 主要負責 |
|------|------|---------|
| 李玲玉 (Liza) | 計畫主持人 | HMEAYC 指標定義、IRB 主責、場域測試協定、教師培訓、論文主筆 |
| 陳育亮 (Ychen) | 軟體開發 | Backend（分析引擎 + API + Gemini）+ Dashboard（React 前端） |
| 陳育冠 (Rover) | 硬體開發 | Firmware（ESP32-C3 + MPU6500）+ PCB 設計 + 採購焊接 |

### 10.4 關鍵介面對齊

| 時間點 | 介面項目 | 對齊內容 |
|--------|---------|---------|
| 2026/07 底 | IMU 傳輸協定 | JSON 欄位名稱、單位、WS URI |
| 2026/08 初 | HMEAYC 指標 | 節奏/穩定/流暢的運算方式與閾值 |
| 2026/09 底 | API 規格 | Restful endpoint 路徑 + WebSocket 協定 |
| 2026/10 | MVP 驗收 | 端到端穿戴 → WS → DB → Dashboard |

---

## 11. 部署規劃

### 11.1 Docker Compose

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: hmeayc
      POSTGRES_USER: hmeayc
      POSTGRES_PASSWORD: hmeayc_dev

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql+asyncpg://hmeayc:hmeayc_dev@db/hmeayc
      GEMINI_API_KEY: ${GEMINI_API_KEY}

  dashboard:
    build: ./dashboard
    ports:
      - "5173:5173"
    depends_on:
      - backend
```

### 11.2 場域測試拓撲

```mermaid
graph LR
    subgraph Classroom["教室"]
        ESP1[ESP32-C3 #1] -->|WiFi| AP[AP Router<br/>192.168.1.x]
        ESP2[ESP32-C3 #2] --> AP
        ESP3[ESP32-C3 #3] --> AP
    end

    subgraph Server["伺服器"]
        AP --> BACKEND[Backend<br/>FastAPI :8080]
        BACKEND --> DB[(PostgreSQL)]
    end

    subgraph Tablet["平板"]
        AP --> DASH[Dashboard<br/>React :5173]
    end
```

### 11.3 CI/CD（GitHub Actions）

```yaml
# CI workflow（示意）
on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: hmeayc_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e backend/
      - run: pytest backend/tests/

  dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: ./dashboard
      - run: npm run lint
        working-directory: ./dashboard
      - run: npm run build
        working-directory: ./dashboard

  firmware:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions-hw/esp-idf-ci@v1
        with: { esp_idf_version: "v5.3" }
      - run: idf.py build
        working-directory: ./firmware
```

### 11.4 資料持久化

```yaml
volumes:
  pgdata:                    # PostgreSQL 資料（docker compose down 時保留）

  # Backend 數據目錄（volume mount 或 bind mount）
  # ./backend/memory/      → identity DB + sessions.jsonl
  # ./backend/reports/     → 分析報告輸出
  # ./backend/tmp/         → 暫存檔
```

---

## 12. OTA 遠端韌體更新

### 12.1 系統架構

```
ESP32-C3                     Backend (FastAPI)
 ┌─────────────┐             ┌──────────────────┐
 │ ota_client   │─ GET /version ─►│ check_version()  │
 │ (periodic)   │◄─ json ────────│ {update,url}     │
 ├─────────────┤             ├──────────────────┤
 │ ota_client   │─ GET /download ─►│ download_firmware │
 │ (on update)  │◄─ binary ───────│ (FileResponse)   │
 ├─────────────┤             ├──────────────────┤
 │ esp_ota_ops │─ flash ota_1 ──│ (local flash)    │
 │ esp_restart │─ reboot ──────│                  │
 ├─────────────┤             ├──────────────────┤
 │ POST /ack   │─────────────►│ ack_update()      │
 └─────────────┘             └──────────────────┘
```

### 12.2 Partition Table (4MB Flash)

| 分割區 | 類型 | 子類型 | 偏移 | 大小 |
|--------|------|--------|------|------|
| nvs | data | nvs | 0x9000 | 16KB |
| otadata | data | ota | 0xD000 | 8KB |
| phy_init | data | phy | 0xF000 | 4KB |
| ota_0 | app | ota_0 | 0x10000 | ~1.81MB |
| ota_1 | app | ota_1 | 0x1E0000 | ~1.81MB |

### 12.3 更新流程

1. **啟動確認**：`ota_mark_boot_successful()` 標記本次開機為有效（`esp_ota_mark_app_valid_cancel_rollback`）
2. **定期檢查**：main loop 每小時 `GET /api/firmware/version?current=X` 檢查新版本
3. **下載更新**：有新版本時呼叫 `ota_perform_update(url)`：
   - `esp_http_client_open` → 串流讀取 binary
   - `esp_ota_begin` → `esp_ota_write`（分塊寫入 ota_1）→ `esp_ota_end`
   - `esp_ota_set_boot_partition(ota_1)` → `esp_restart()`
4. **回退機制**：新版本啟動後若未呼叫 `ota_mark_boot_successful()`（crash 或手動重啟兩次），bootloader 自動切回舊分割區

### 12.4 後端 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/firmware/version?current=X` | 版本檢查（回傳有無更新 + 下載 URL） |
| POST | `/api/firmware/upload` | 上傳新韌體 binary（multipart form） |
| GET | `/api/firmware/download/{id}` | 下載韌體 binary |
| GET | `/api/firmware/list` | 列出所有版本 |
| POST | `/api/firmware/ack` | 裝置確認新韌體啟動成功 |

### 12.5 操作方式

```bash
# 1. 建立第一版韌體並燒錄（idf.py flash 寫入 ota_0）
cd firmware
idf.py set-target esp32c3
idf.py menuconfig   # 設定 WiFi/WS/OTA URL
idf.py build flash monitor

# 2. 建置新版韌體
idf.py build
# output: build/hmeayc_firmware.bin

# 3. 上傳到後端
curl -X POST http://localhost:8080/api/firmware/upload \
  -F "version=0.2.0" \
  -F "description=fix IMU drift + add battery ADC" \
  -F "file=@build/hmeayc_firmware.bin"

# 4. ESP32 自動在一小時內檢查到更新→下載→重啟
# 也可在 ESP console 強制檢查：
#   esp_console 輸入: ota check
# （需另建 console task，目前未實作）

# 5. 確認 OTA 成功：查詢 firmware 版本
curl http://localhost:8080/api/firmware/list
```

### 12.6 安全注意事項

- 目前使用 HTTP（非 HTTPS）— 僅適用於 LAN 環境
- 上傳端點目前無 API key 保護（建議後續加上 `KINDER_API_KEY` 驗證）
- 韌體 binary 無簽章驗證 — 若需更高安全性可整合 `esp_encrypted_img`

---

## 13. 驗收標準與量化 KPI

### 13.1 MVP 驗收原則

MVP 不只要求功能可用，也要有可重複驗證的量化門檻。每個 milestone 需同時滿足「功能完成」與「測試通過」兩個條件。

### 13.2 建議 KPI

| 項目 | 建議門檻 | 驗證方式 |
|------|----------|----------|
| IMU 上傳頻率 | 穩定 50Hz，資料遺失率 < 1% | 裝置連續上傳 10 分鐘抽樣檢查 |
| WebSocket 延遲 | LAN 環境端到端 < 200ms | 前端/後端時間戳比對 |
| 斷線重連 | 30 秒內恢復連線 | 斷網/復網情境測試 |
| 報告生成時間 | 10 分鐘課程 < 60 秒 | 產生報告計時 |
| Dashboard 載入 | 首頁可在 3 秒內顯示主要導覽 | 瀏覽器實測 |
| OTA 更新 | 更新成功率 > 95%，失敗可回滾 | 模擬更新與 rollback |

### 13.3 交付定義

- 任何功能若沒有對應測試案例，不列入正式完成
- 任何 UI 若無法在測試環境重現，不列入 MVP 完成
- 任何裝置流程若無法在單次課堂完整跑完，不列入場域測試準備完成

---

## 14. 資安、隱私與資料治理

### 14.1 資料分類

| 類別 | 範例 | 保護等級 |
|------|------|----------|
| 高敏感資料 | 幼兒姓名、學號、家長同意文件 | 最高 |
| 敏感資料 | WiFi 密碼、裝置識別碼、課堂紀錄 | 高 |
| 一般資料 | 系統狀態、匿名化分析結果 | 中 |

### 14.2 保護原則

- 最小蒐集：只蒐集完成研究所需資料
- 最小暴露：前端與 API 不回傳不必要敏感欄位
- 最小權限：管理操作與查詢操作分開
- 可追溯：設定變更、報告生成、裝置配對需保留 log

### 14.3 資料保存與刪除

- 研究資料需明定保存期限與刪除條件
- 家長撤回同意後，應有清除對應資料的流程
- 音訊、影像若非必要，不進行長期保存
- 匿名化後才可進行跨場域分析或模型統計

### 14.4 系統安全要求

- WiFi 密碼不得透過 URL 傳遞
- API 金鑰不得寫入前端 bundle
- 後端預設使用 allowlist CORS
- OTA 韌體更新應考慮簽章或加密策略

---

## 15. 測試與品質保證

### 15.1 測試層級

| 層級 | 內容 | 目標 |
|------|------|------|
| 單元測試 | 分析函式、時間碼、資料轉換 | 驗證核心邏輯 |
| 整合測試 | REST API、WebSocket、DB 存取 | 驗證模組串接 |
| E2E 測試 | Dashboard 主流程、報告流程 | 驗證使用者路徑 |
| 裝置測試 | ESP32 連線、重連、OTA | 驗證場域穩定性 |
| 場域測試 | 實際課堂中運行 | 驗證研究可用性 |

### 15.2 必跑檢查

- Backend：`pytest`
- Frontend：`npm run lint`
- Frontend：`npm run build`
- Firmware：`idf.py build`
- Compose：`docker compose up` 基本啟動檢查

### 15.3 發版門檻

- 核心 API 不能有未處理的 5xx
- 前端 build 必須通過
- 重要頁面不得依賴未定義資料
- 場域版本不得含明顯 debug log

---

## 16. 維運與故障處理

### 16.1 基本維運項目

- PostgreSQL 備份與還原
- 韌體 OTA 回滾與救援流程
- 日誌保存與輪替
- 健康檢查與服務重啟策略
- 場域裝置離線告警

### 16.2 故障分級

| 等級 | 範例 | 處理方式 |
|------|------|----------|
| P0 | 服務全面中斷 | 立即處理並停止新部署 |
| P1 | 主要裝置無法上傳 | 啟動手動備援 |
| P2 | 個別頁面錯誤 | 排入下一次修復 |
| P3 | 文案/文件問題 | 納入例行整理 |

### 16.3 備援策略

- 裝置端斷線時應暫存或重送
- 後端短暫不可用時應保留課堂資料
- OTA 更新失敗時應可回復前一版本
- 場域測試時保留手動記錄方式

---

## 17. API 與版本管理

### 17.1 API 合約

- 每個 endpoint 應定義 request / response schema
- 錯誤回應應有固定格式與錯誤碼
- WebSocket message 需明確定義 `type` 與欄位
- 若欄位會變動，需先定義向後相容策略

### 17.2 版本策略

- REST API 建議加入版本前綴，如 `/api/v1`
- 韌體與後端互通協定需記錄最低相容版本
- Dashboard 與後端欄位變更需先做過渡期相容

### 17.3 文件同步

- API 變更需同步更新 README / 開發計劃 / 前端型別
- 韌體協定變更需同步更新 Kconfig 與操作說明
- 場域版與開發版要清楚區隔版本號

---

## 12. Repo 結構
> 記錄時間：2026-07-02 — 因應 repo flatten 後重新組織

### 12.1 目錄布局

```
HMEAYC/
├── NSTC/                        # 主要專案目錄（所有原始碼集中於此）
│   ├── backend/                 # FastAPI 後端
│   ├── dashboard/               # React + Vite 前端
│   ├── firmware/                # ESP-IDF 韌體
│   ├── hardware/                # 硬體設計文件
│   ├── deploy/                  # 部署腳本
│   ├── documents/               # 計畫相關文件
│   ├── field-testing/           # 場域測試腳本
│   ├── .opencode/               # opencode 組態與開發計畫
│   ├── .dockerignore
│   ├── .gitignore
│   ├── Makefile
│   ├── docker-compose.yml
│   ├── start.sh / stop.sh       # 一鍵背景啟動/停止
│   └── OPERATION.md
├── web/                         # 課程介紹靜態網站（gitignored, 獨立倉庫）
└── kinder-vision/               # （新，非 git 追蹤）
```

### 12.2 與 git HEAD 的差異

2026-07-02 檢查時，工作目錄（`NSTC/`）與 git HEAD（root 扁平結構）有 **30+ 檔案內容差異**及 **6 個全新檔案**，摘要如下：

| 類別 | 變更 |
|------|------|
| 後端 | CORS 白名單、WebSocket 訊息正規化、Session API 回傳擴充、Report 模型加欄位、API key 驗證機制、WiFi Config endpoint |
| 前端 | Lazy loading、新增韌體/WiFi 頁面、多裝置即時監控、Report 兩階段載入 |
| 韌體 | Device registry、遠端 WiFi 設定、IMU type 標記 |
| 全新 | `backend/app/auth.py`, `backend/app/api/config.py`, `backend/app/models/wifi_config.py`, `FirmwareUpload.tsx`, `WiFiConfig.tsx`, `start.sh`, `stop.sh` |

詳細 diff 請參考 git 記錄 (`git diff HEAD -- NSTC/`)。

---

## 附錄 A：風險管理

| 風險 | 影響 | 機率 | 緩解措施 |
|------|------|------|---------|
| IRB 審查延遲 | 場域測試無法進行 | 中 | 提前 9 月送審，11–12 月取得核准 |
| 硬體採購延遲 | 韌體開發受阻 | 低 | 先以開發板測試，採購後換板 |
| OTA 更新失敗 | 裝置變磚無法使用 | 低 | AB 分割區 + rollback 保護；先以 USB 燒錄救援 |
| WiFi 干擾 | 即時傳輸不穩 | 中 | 支援本地 SD 卡緩存 + 事後上傳（V2） |
| 電池續航不足 | 無法完成單堂課 | 低 | 402030 200mAh 約 1.5h；可選外部 14500 延長 |
| IMU 雜訊 | 分析準確度下降 | 中 | 軟體濾波 + 參數校準流程 |
| AI API 費用超支 | 無法生成報告 | 低 | 支援 OpenAI-compatible 自架 LLM |

## 附錄 B：參考資料

- HMEAYC 理論：Liza Li 教授論文（TBD）
- MPU6500 Register Map：https://invensense.tdk.com/wp-content/uploads/2023/11/MPU-6000-Datasheet1.pdf
- ESP-IDF Programming Guide：https://docs.espressif.com/projects/esp-idf/
- FastAPI：https://fastapi.tiangolo.com/
- Ultralytics YOLOv8 Pose：https://docs.ultralytics.com/tasks/pose/
- MediaPipe Pose Landmarker：https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
