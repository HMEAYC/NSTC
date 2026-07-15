# 全系統 Bug Fix 與清理計畫
> 2026-07-15 | 全面修正 audit 發現的所有問題

## Phase 1: Critical Bugs（優先修正）

### 1.1 `AssessmentIndicators.tsx` — `r.results` → `r.assessments`
**位置:** `dashboard/src/pages/AssessmentIndicators.tsx:161-173`
**問題:** API 回傳 `assessments` key，但前端用 `r.results`，導致已儲存評估永遠顯示為空。
**修正:**
- Line 161: `r.results` → `r.assessments`
- Line 162: `r.results` → `r.assessments`
- Line 173: `r.results` → `r.assessments`

### 1.2 `assessments.py` — `window_sec` 計算錯誤
**位置:** `backend/app/api/assessments.py:107-109`
**問題:** `rows` 只 SELECT accel_x/y/z，`rows[0][0]` 是 accel_x 而非 timestamp。計算出的 window_sec 是第一筆與最後筆加速度值的差，而非時間跨度。
**修正:** 改為用 `IMUData.timestamp` 做獨立查詢：
```python
ts_query = (
    db.query(func.min(IMUData.timestamp), func.max(IMUData.timestamp))
    .filter(IMUData.session_id == session_id, IMUData.device_id == raw_device_id)
    .first()
)
min_ts, max_ts = ts_query if ts_query else (0, 0)
window_sec = (max_ts - min_ts) / 1000.0 if min_ts and max_ts else 0
```
（假設 timestamp 為毫秒，需確認 IMUData.timestamp 單位）

### 1.3 `auth/org.py:34` — 回傳空字串
**位置:** `backend/app/auth/org.py:34`
**問題:** `user.org_id if user.org_id is not None else ""` 回傳空字串，導致 org_id 過濾異常（空字串 ≠ None）。
**修正:** 改為 `return user.org_id or DEFAULT_ORG_ID`（空字串也視為未設定，回退到預設 org）。

## Phase 2: Medium Issues

### 2.1 `session.py` — `music_bpm`/`music_duration` 精度截斷
**位置:** `backend/app/models/session.py:30,33`
**問題:** Column 為 `Integer`，但 `music.py` 回傳 float BPM（如 120.5），API 也用 float。存入 DB 時被截斷。
**修正:** 改為 `Column(Float, nullable=True)`（需 import Float）。Alembic migration 一個小版本升級即可（Integer → Float 不會丟資料）。

### 2.2 `config.py` — WiFi 認證過鬆
**位置:** `backend/app/api/config.py`
**問題:** GET 無認證（任何人可讀 SSID），PUT 僅需 login（parent 可改）。
**修正:**
- GET: 加 `require_role("org_admin", "super_admin", "teacher")` 或至少 `require_login`
- PUT: 改為 `require_role("org_admin", "super_admin")`

### 2.3 `sessions.py:281-294` — `delete_session` 缺清理
**位置:** `backend/app/api/sessions.py:281-294`
**問題:** 刪除 session 時未清理 `AssessmentResult` 和 `SessionEvaluation`。
**修正:** 在現有 delete 前加入：
```python
db.query(AssessmentResult).filter(AssessmentResult.session_id == session_id).delete(synchronize_session=False)
db.query(SessionEvaluation).filter(SessionEvaluation.session_id == session_id).delete(synchronize_session=False)
```

### 2.4 `client.ts:360-373` — `uploadSessionMusic` Content-Type 衝突
**位置:** `dashboard/src/api/client.ts:360-373`
**問題:** `fetchJSON` 自動設 `Content-Type: application/json`，但 FormData 需要 multipart boundary。
**修正:** 不用 `fetchJSON`，改用原生 `fetch` 並手動處理：
```typescript
uploadSessionMusic: (sessionId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return fetch(`/api/sessions/${sessionId}/music`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
},
```

### 2.5 `test/api.test.ts:47` — 呼叫不存在的方法
**位置:** `dashboard/src/test/api.test.ts:47`
**問題:** `api.getWifiConfig()` 方法不存在，應為 `api.getDeviceWifiConfig(deviceId)`。
**修正:** 改為 `api.getDeviceWifiConfig("test-device-1")` 並調整 expected URL。

## Phase 3: Low Issues

### 3.1 `firmware.py:122-132` — 死端點 `POST /api/firmware/ack`
**位置:** `backend/app/api/firmware.py:122-132`
**問題:** OTA 已改為 GitHub Pages，ack 功能已移除。
**修正:** 刪除 `ack_update` 函數。

### 3.2 `sessions.py:15` — 未使用 import `settings`
**位置:** `backend/app/api/sessions.py:15`
**修正:** 刪除 `from app.config import settings`

### 3.3 `templates.py:3` — 未使用 import `datetime`
**位置:** `backend/app/api/templates.py:3`
**修正:** 刪除 `from datetime import datetime`

### 3.4 `config.py:6` — 未使用 import `get_current_user`
**位置:** `backend/app/api/config.py:6`
**修正:** 從 import 中移除 `get_current_user`（只保留 `require_login`）

### 3.5 `sessions.py:682-684` — 空 `pass` 區塊
**位置:** `backend/app/api/sessions.py:682-684`
**修正:** 移除空 `pass`，改為加 placeholder comment 或直接刪除。

### 3.6 `assessments.py:419-421` — 死查詢 `class_obj`
**位置:** `backend/app/api/assessments.py:419-421`
**問題:** 查詢 `SessionModel` 但結果 `class_obj` 未使用（查詢邏輯也有誤：用 class_id 查 SessionModel.id）。
**修正:** 刪除 `class_obj` 查詢。

### 3.7 `admin.py` — 直接回傳 SQLAlchemy 對象
**位置:** `backend/app/api/admin.py` 多處（line 75, 100, 129, 156, 170, 189, 204, 218, 245, 269, 297, 330, 361, 379, 426, 437, 454）
**問題:** 如 `return {"org": org}` 直接傳 SQLAlchemy 物件，FastAPI 依賴 `model_config = {"from_attributes": True}` 序列化。雖然 Pydantic v2 能處理，但不一致（有些用 response model，有些直接傳）。
**修正:** 全部改為用已定義的 Response model（OrgResponse, ClassResponse, UserResponse, ChildResponse）包裝。

### 3.8 `UserInfo` 介面重複定義
**位置:** `dashboard/src/api/client.ts:21` + `dashboard/src/auth/context.tsx:3`
**修正:** 在 `context.tsx` 改為從 `client.ts` import：
```typescript
import type { UserInfo } from "../api/client";
```

### 3.9 `useWebSocket.ts:70-86` — 未處理 `analysis`/`status` 訊息
**位置:** `dashboard/src/hooks/useWebSocket.ts:70-86`
**問題:** 定義了 `type` 包含 `"analysis"` 和 `"status"`，但收到時不處理。
**修正:** 低優先，暫不處理（未來有用到時再加）。

## Phase 4: 文件不一致

### 4.1 Port 8080 → 8000
**位置:**
- `start.sh:14,16,32` — 改為 8000
- `docker-compose.yml:21,27` — 改為 8000:8000
- `Makefile:7` — 改為 8000
**修正:** 全部改為 8000。

### 4.2 `FirmwareUpload.tsx:130` — OTA 說明文字過時
**修正:** 改為描述 GitHub Pages 流程。

### 4.3 `development-plan.md` — 多處過時內容
**位置:** WS2812B 引用、`led_status.c`、`/courses` 路由、GPIO table line 306
**修正:** 清理所有過時引用。

### 4.4 `hardware/README.md:206,308` + `hardware/schematic.md:185-192` — ME6211/SS12 殘留
**修正:** 更新 PCB 圖和測試步驟。

### 4.5 `README.md` + `development-plan.md` — 里程碑日期衝突
**修正:** 統一為 2026-12。

## Phase 5: Frontend `fetch()` → `api` client 統一

**位置:** ClassDetail, Landing, DeviceManagement, UserManagement, AdminOrgs, ParentView, Sessions, ClassManagement, AcceptInvite, Register（共 10 頁）
**問題:** 繞過 `API_BASE` 硬編碼，不走統一 auth flow。
**修正:** 逐步改為使用 `api.*` 方法（每個頁面需檢查 authHeaders、API_BASE 等差異）。

## Verification Plan

1. **後端測試:** `cd backend && python -m pytest`（確認 22/22 通過）
2. **前端型別檢查:** `cd dashboard && npx tsc --noEmit`
3. **手動驗證:**
   - AssessmentIndicators 載入已儲存評估
   - WiFi config GET 需認證
   - delete_session 清理所有關聯資料
   - uploadSessionMusic 上傳成功
4. **文件一致性:** grep 確認無 8080 殘留、無 ME6211/SS12 殘留
