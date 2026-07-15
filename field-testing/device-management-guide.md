# 多人系統裝置管理 — 操作與驗證指南

## 系統概覽

```
┌─────────────────────┐     ┌──────────────────────┐
│  ESP32-C3 腰帶 × N   │     │  天花板攝影機          │
│  IMU 50Hz WebSocket  │     │  MediaPipe Pose 30fps │
└────────┬────────────┘     └──────────┬───────────┘
         │  WS JSON                     │  REST (keypoints)
         ▼                             ▼
┌──────────────────────────────────────────────┐
│              FastAPI 後端 (:8000)               │
│                                                │
│  Device/Child CRUD → Session → Assignment      │
│                                                │
│  FFT Phase Extraction → Hungarian Assignment   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Dashboard (:5173)                            │
│  📡 /devices   裝置管理 + 學員管理 + 配對機制   │
│  🎯 /assessment/:id  即時 IMU 評估指標         │
│  📊 /live/:id       即時 IMU 6 軸圖表          │
└──────────────────────────────────────────────┘
```

---

## 操作流程

### Step 1: 啟動系統

```bash
# 1. 啟動 PostgreSQL（Docker）
docker compose up -d db

# 2. 啟動後端
cd backend && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3. 啟動 Dashboard（另一個 terminal）
cd dashboard && npm run dev
```

驗證：`curl http://localhost:8000/health` → `{"status":"ok"}`

### Step 2: 註冊 ESP32 腰帶（自動 / 手動）

**自動方式：** ESP32 開機並連上 WiFi 後，韌體會主動呼叫後端 `POST /api/devices`。  
Device ID 由韌體中的 `device_id` 定義，並會帶上 `firmware_version`。

**手動方式（測試用）：**

```bash
# 註冊腰帶 A
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-001","name":"腰帶 A","firmware_version":"v0.1.0"}'

# 註冊腰帶 B
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-c3-002","name":"腰帶 B","firmware_version":"v0.1.0"}'
```

### Step 3: 註冊學員

```bash
curl -X POST http://localhost:8000/api/children \
  -H "Content-Type: application/json" \
  -d '{"name":"小明","student_id":"S001","notes":"3歲"}'

curl -X POST http://localhost:8000/api/children \
  -H "Content-Type: application/json" \
  -d '{"name":"小華","student_id":"S002","notes":"4歲"}'
```

### Step 4: 建立課程

```bash
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"course_type":"march"}'
# 回傳 session_id (UUID)
```

### Step 5: 配對腰帶 → 學員

**手動配對（教師操作）：**

```bash
# 取得 device_id 和 child_id
DEVICES=$(curl -s http://localhost:8000/api/devices)
CHILDREN=$(curl -s http://localhost:8000/api/children)

# 配對腰帶 A → 小明
curl -X POST http://localhost:8000/api/sessions/{SESSION_ID}/assign \
  -H "Content-Type: application/json" \
  -d '{"device_id":"{DEVICE_A_ID}","child_id":"{CHILD_A_ID}","confidence":0.95}'
```

**自動配對（論文演算法，已實作）：**

跨模態配對演算法（FFT 相位匹配 + Hungarian 全域最優指派）已實作為獨立端點 `POST /api/sessions/{id}/auto-pair`，可在課程詳情頁的配對彈窗中點擊「🔗 跨模態自動配對」執行。系統會擷取每個裝置的 IMU 加速度 magnitude 做 FFT 取得主頻率與相位：若攝影機已上傳課程錄影並取得視覺髖部軌跡相位，會與 IMU 相位做交叉相關，回傳 `method: "fft_phase_cross_modal"`；若無攝影機資料，則僅以 IMU 頻譜相位排序配對，回傳 `method: "fft_phase_imu_only"`，信心分數計算方式不同（且普遍較低）。

手動配對（`POST /api/sessions/{id}/assign`）仍是獨立端點，method 參數固定為 `"manual"`；自動配對一律走 `/auto-pair` 端點，不會混用同一支 API。

### Step 6: 開啟 Dashboard 管理

| URL | 內容 |
|-----|------|
| `http://localhost:5173/dashboard/devices` | 裝置列表（狀態/電量/韌體）、學員管理、配對機制說明 |
| `http://localhost:5173/dashboard/assessment/default` | 即時 IMU 指標（活動量/平穩度/穩定指數） |
| `http://localhost:5173/dashboard/live/default` | 即時 IMU 6 軸圖表 |

### Step 7: 查詢配對結果

```bash
curl -s http://localhost:8000/api/sessions/{SESSION_ID}/assignments | python3 -m json.tool
```

回應範例：
```json
{
  "assignments": [
    {
      "device_name": "腰帶 A",
      "child_name": "小明",
      "confidence": 0.95,
      "method": "manual"
    },
    {
      "device_name": "腰帶 B",
      "child_name": "小華",
      "confidence": 0.88,
      "method": "manual"
    }
  ]
}
```

---

## 驗證方法

### 方法 A：自動化 API 測試

```bash
bash field-testing/verify-device-management.sh
```

此腳本會依序測試：
1. 裝置註冊 / 列出 / 心跳更新
2. 學員註冊 / 列出
3. 課程建立 / 配對 / 覆寫配對 / 查詢
4. 錯誤處理（不存在裝置 / Session）
5. Dashboard 頁面 HTTP 200 回應

### 方法 B：pytest 單元測試

```bash
cd backend && python3 -m pytest tests/test_basic.py -v
```

包含路由完整覆蓋檢查（確認 `/api/devices`、`/api/children`、`/api/sessions/{id}/assignments`、`/api/sessions/{id}/assign` 存在）

### 方法 C：手動 Dashboard 驗證

1. 開啟 `http://localhost:5173/dashboard/devices`
2. 確認三頁籤正常切換
3. 確認裝置列表顯示正確
4. 嘗試註冊學員
5. 開啟 `http://localhost:5173/dashboard/assessment/default`
6. 確認 IMU 連線後三張指標卡即時更新

---

## 資料庫模型對照

| Table | 用途 | 關鍵欄位 |
|-------|------|---------|
| `devices` | ESP32 腰帶註冊 | device_id (UK), name, firmware_version, battery_level, status, last_seen |
| `children` | 學員資料 | name, student_id (UK), notes |
| `device_assignments` | 配對記錄 | session_id FK, device_id FK, child_id FK, confidence, method |

---

## 常見問題

**Q: ESP32 連上後不會自動出現在裝置列表？**  
A: 檢查 ESP32 是否成功發送 `POST /api/devices`。若 WiFi 尚未連線或後端暫時不可用，可手動呼叫測試。

**Q: 配對後學員資料會跨課程保留嗎？**  
A: 會。`Child` 表為獨立記錄，跨課程共用。`DeviceAssignment` 以 `(session_id, device_id)` 唯一約束。

**Q: 同一個課程中腰帶可以換人戴嗎？**  
A: 可以。呼叫 `POST /assign` 覆寫即可，`method` 會記錄為新的配對。

**Q: 信心分數的意義？**  
A: `confidence ∈ [0, 1]`。1.0 = 完全確定，< 0.7 建議教師手動確認。
