# 即時音樂源整合實作計畫

> **方案：** Session 綁定音樂檔（Approach A）
> **目標：** 讓節奏同步分析與凍結偵測在即時 IMU 串流模式下運作
> **前置條件：** librosa 已是專案依賴（pyproject.toml），rhythm.py / freeze_dance.py 已完整實作但未被呼叫

---

## 1. 現狀問題

| 組件 | 狀態 |
|------|------|
| `rhythm.py:analyze_rhythm_sync(imu_data, bpm)` | ✅ 已實作，**從未被呼叫** |
| `freeze_dance.py:analyze_freeze_response(imu_data, music_stop_time)` | ✅ 已實作，**從未被呼叫** |
| `assessments.py` compute 端點 | ⚠️ 用零交叉率/振幅比近似，未使用上述函式 |
| WebSocket handler | 純中繼，無音樂通道 |
| Session 模型 | 無 BPM、音樂檔等欄位 |

---

## 2. 架構設計

```
教師建立 Session → 選擇音樂檔（或手動輸入 BPM）
       │
       ▼
POST /api/sessions/{id}/music          ← 新端點：上傳音樂或設定 BPM
  → librosa 分析 → BPM + beat_times + stop_times
  → 存入 DB 欄位
       │
       ▼
POST /api/sessions/{id}/start
  → 讀取音樂資訊
  → WebSocket 廣播 {"type":"music", "bpm":120, "beat_times":[...], "stop_times":[...]}
       │
       ▼
教師在教室播放同一首歌
       │
       ▼
即時分析：
  - IMU data 來時 → 暫存緩衝區（最近 30 秒）
  - 每 5 秒 → 呼叫 analyze_rhythm_sync(buffer, bpm) → rhythm_sync_rate
  - 每個 stop_time 觸發時 → 呼叫 analyze_freeze_response(buffer, stop_time) → reaction_time
  - 結果 WebSocket 廣播 {"type":"analysis", ...}
       │
       ▼
Dashboard LiveView 顯示即時節拍指示器 + 評估指標
```

---

## 3. 分階段實作

### Phase 1：資料模型 + 音樂分析 API（後端）

#### 3.1 Session 模型新增欄位

**檔案：** `backend/app/models/session.py`

```python
# 新增以下欄位
music_file = Column(String(500), nullable=True)      # 音樂檔路徑（相對路徑）
music_bpm = Column(Float, nullable=True)              # 預分析的 BPM
music_beat_times = Column(JSON, nullable=True)        # [0.52, 1.04, 1.56, ...] 秒
music_stop_times = Column(JSON, nullable=True)        # [8.2, 15.7, ...] 秒（RMS drop 偵測）
music_duration = Column(Float, nullable=True)         # 音樂總長度（秒）
music_element = Column(String(100), nullable=True)    # 複寫自 template 的音樂元素
```

#### 3.2 Alembic Migration

```bash
cd backend && alembic revision --autogenerate -m "add music columns to sessions"
```

#### 3.3 音樂分析工具模組

**新檔案：** `backend/app/music.py`

```python
"""音樂分析工具：從上傳的音樂檔提取 BPM、beat times、stop times。"""

import librosa
import numpy as np
from pathlib import Path


def analyze_music(file_path: str | Path) -> dict:
    """
    分析音樂檔，回傳:
    {
        "bpm": float,
        "beat_times": list[float],    # 秒
        "stop_times": list[float],    # 秒（RMS energy 急降點）
        "duration": float,            # 秒
    }
    """
    y, sr = librosa.load(str(file_path), sr=22050, mono=True)

    # BPM + beat onset detection
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = [float(t) for t in beat_frames]

    # Stop detection: RMS energy 急降（> 35% 低於中位數）
    rms = librosa.feature.rms(y=y)[0]
    hop_length = 512
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    median_rms = float(np.median(rms))
    threshold = median_rms * 0.65
    stop_times = []
    for i in range(1, len(rms)):
        if rms[i - 1] > median_rms and rms[i] < threshold:
            stop_times.append(float(times[i]))

    return {
        "bpm": round(bpm, 1),
        "beat_times": [round(t, 3) for t in beat_times],
        "stop_times": [round(t, 3) for t in stop_times],
        "duration": round(float(len(y) / sr), 2),
    }
```

#### 3.4 Session API 新增音樂端點

**檔案：** `backend/app/api/sessions.py`

新增端點：

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/sessions/{id}/music` | 上傳音樂檔或直接設定 BPM |
| `DELETE` | `/api/sessions/{id}/music` | 移除音樂設定 |

**POST /api/sessions/{id}/music** 邏輯：

1. 接收 `music_file`（UploadFile）或 `bpm`（float，手動輸入模式）
2. 若有檔案：儲存至 `backend/uploads/music/` → 呼叫 `analyze_music()` → 取得 BPM/beat_times/stop_times
3. 若僅有 BPM：beat_times = `[]`（用 BPM 推算間隔即可），stop_times = `[]`
4. 寫入 Session 的 `music_*` 欄位
5. 從 Session 的 template 複寫 `music_element`（取 stages[0].music_element）
6. 回傳分析結果

**Session GET /api/sessions/{id}** 修改：

回傳新增的 `music_bpm`, `music_beat_times`, `music_stop_times`, `music_element` 欄位。

#### 3.5 Start Session 廣播音樂資訊

**檔案：** `backend/app/api/sessions.py` — `start_session()` 函式

修改：session 開始時，若已有音樂資訊，透過 WebSocket 廣播給所有 viewers。

```python
# 在 db.commit() 之後
if session.music_bpm:
    from app.api.ws import broadcast_to_session
    await broadcast_to_session(session_id, {
        "type": "music",
        "bpm": session.music_bpm,
        "beat_times": session.music_beat_times or [],
        "stop_times": session.music_stop_times or [],
        "duration": session.music_duration,
        "music_element": session.music_element,
    })
```

**檔案：** `backend/app/api/ws.py`

新增共用廣播函式：

```python
async def broadcast_to_session(session_id: str, message: dict):
    """廣播訊息給指定 session 的所有 viewer。"""
    viewers = list(_viewers.get(session_id, set()))
    for viewer in viewers:
        try:
            await viewer.send_json(message)
        except Exception:
            _viewers.get(session_id, set()).discard(viewer)
```

---

### Phase 2：即時分析管線（後端）

#### 3.6 IMU 緩衝區 + 定期分析

**新檔案：** `backend/app/analysis/realtime.py`

```python
"""即時音樂分析管線：從 IMU 緩衝區 + 音樂資訊 → 即時評估。"""

import threading
import time
from collections import deque
from app.analysis.rhythm import analyze_rhythm_sync
from app.analysis.freeze_dance import analyze_freeze_response

class RealtimeAnalyzer:
    def __init__(self, session_id: str, bpm: float, beat_times: list[float],
                 stop_times: list[float], music_duration: float):
        self.session_id = session_id
        self.bpm = bpm
        self.beat_times = beat_times
        self.stop_times = stop_times
        self.music_duration = music_duration
        self._buffer: deque[dict] = deque(maxlen=1500)  # 30s @ 50Hz
        self._stop_index = 0  # 已處理的 stop_times index
        self._start_time: float | None = None

    def ingest(self, frame: dict):
        """每筆 IMU frame 呼叫此函式。"""
        if self._start_time is None:
            self._start_time = frame.get("ts", time.time())
        self._buffer.append(frame)

    def compute_rhythm(self) -> dict | None:
        """從緩衝區計算節奏同步率。"""
        if len(self._buffer) < 100:
            return None
        return analyze_rhythm_sync(list(self._buffer), self.bpm)

    def check_freeze(self, current_time: float) -> dict | None:
        """檢查是否有 stop_time 觸發，若有則計算凍結反應。"""
        if self._stop_index >= len(self.stop_times):
            return None
        elapsed = current_time - (self._start_time or current_time)
        if elapsed >= self.stop_times[self._stop_index]:
            self._stop_index += 1
            return analyze_freeze_response(
                list(self._buffer),
                self.stop_times[self._stop_index - 1] * 1000  # 轉 ms
            )
        return None
```

#### 3.7 WebSocket Handler 整合

**檔案：** `backend/app/api/ws.py`

修改 IMU 訊息處理區塊：

```python
# 在 IMU frame 存入 DB 之後
# 檢查是否此 session 有音樂資訊
if session.music_bpm:
    analyzer = _get_or_create_analyzer(session)
    analyzer.ingest(data)

    # 每 5 秒計算一次節奏同步
    if frame_count % 250 == 0:  # 250 frames @ 50Hz = 5s
        rhythm_result = analyzer.compute_rhythm()
        if rhythm_result:
            await broadcast_to_session(session_id, {
                "type": "rhythm_update",
                "rhythm_sync_rate": rhythm_result["sync_rate"],
                "bpm": rhythm_result["bpm"],
                "peak_count": rhythm_result["peak_count"],
                "beat_count": rhythm_result["beat_count"],
            })

    # 檢查凍結觸發
    freeze_result = analyzer.check_freeze(ts / 1000.0)
    if freeze_result:
        await broadcast_to_session(session_id, {
            "type": "freeze_update",
            "reaction_time": freeze_result["reaction_time"],
            "stability_score": freeze_result["stability_score"],
        })
```

**模組級快取：** `_analyzers: dict[str, RealtimeAnalyzer] = {}`

---

### Phase 3：前端整合

#### 3.8 WebSocket Hook 擴充

**檔案：** `dashboard/src/hooks/useWebSocket.ts`

```typescript
// IMUFrame.type 擴充
type: "imu" | "analysis" | "status" | "music" | "rhythm_update" | "freeze_update";

// 新增音樂相關 callback
onMusic?: (data: { bpm: number; beat_times: number[]; stop_times: number[]; music_element: string }) => void;
onRhythmUpdate?: (data: { rhythm_sync_rate: number; bpm: number }) => void;
onFreezeUpdate?: (data: { reaction_time: number; stability_score: number }) => void;
```

在 `onmessage` 處理中新增分支：

```typescript
if (frame.type === "music") {
    onMusic?.(frame as any);
} else if (frame.type === "rhythm_update") {
    onRhythmUpdate?.(frame as any);
} else if (frame.type === "freeze_update") {
    onFreezeUpdate?.(frame as any);
} else if (!frame.type || frame.type === "imu") {
    onMessage?.(frame as IMUFrame);
}
```

#### 3.9 LiveView 即時節拍指示器

**檔案：** `dashboard/src/pages/LiveView.tsx`

新增狀態：

```typescript
const [musicInfo, setMusicInfo] = useState<{
    bpm: number;
    beat_times: number[];
    stop_times: number[];
    music_element: string;
} | null>(null);

const [rhythmSyncRate, setRhythmSyncRate] = useState<number | null>(null);
const [freezeData, setFreezeData] = useState<{
    reaction_time: number;
    stability_score: number;
} | null>(null);
```

傳入 WebSocket hook：

```typescript
useWebSocket(sid, {
    onMessage: handleIMU,
    onMusic: setMusicInfo,
    onRhythmUpdate: (d) => setRhythmSyncRate(d.rhythm_sync_rate),
    onFreezeUpdate: setFreezeData,
});
```

UI 新增區塊（在連線狀態指示器旁）：

```tsx
{musicInfo && (
    <div className="flex items-center gap-4 text-sm">
        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
            🎵 {musicInfo.music_element}
        </span>
        <span className="font-mono">{musicInfo.bpm} BPM</span>
        {rhythmSyncRate !== null && (
            <span className={rhythmSyncRate > 0.7 ? "text-green-600" : "text-orange-500"}>
                同步率 {(rhythmSyncRate * 100).toFixed(0)}%
            </span>
        )}
    </div>
)}
```

#### 3.10 AssessmentIndicators 替換占位符

**檔案：** `dashboard/src/pages/AssessmentIndicators.tsx`

將 `value="--"` 替換為從 WebSocket 收到的即時值：

```tsx
<MetricCard
    icon="🎵" title="節奏同步誤差" desc="動作波峰 vs 音樂拍點"
    value={rhythmSyncRate !== null ? `${(rhythmSyncRate * 100).toFixed(0)}%` : "--"}
    rating={rhythmSyncRate !== null ? (rhythmSyncRate > 0.7 ? "excellent" : "good") : undefined}
    placeholderText={rhythmSyncRate === null ? "需音樂拍點參考 (BPM + beat tracking)" : undefined}
/>
```

#### 3.11 SessionDetail 音樂設定 UI

**檔案：** `dashboard/src/pages/SessionDetail.tsx`

在 Session 詳情頁新增「音樂設定」區塊（session 為 draft/scheduled 時顯示）：

- 選擇上傳音樂檔（`.mp3`, `.wav`, `.m4a`）
- 或手動輸入 BPM
- 上傳後顯示分析結果：BPM、beat 數量、stop times 數量
- 支援移除/重新設定

#### 3.12 API Client 新增方法

**檔案：** `dashboard/src/api/client.ts`

```typescript
uploadSessionMusic: async (sessionId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const tok = getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/music`, {
        method: "POST", body: form, headers,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
},

setSessionBpm: (sessionId: string, bpm: number) =>
    fetchJSON<{ bpm: number }>(`/api/sessions/${sessionId}/music`, {
        method: "POST",
        body: JSON.stringify({ bpm }),
    }),

removeSessionMusic: (sessionId: string) =>
    fetchJSON<{ status: string }>(`/api/sessions/${sessionId}/music`, {
        method: "DELETE",
    }),
```

---

## 4. 檔案變更摘要

| # | 檔案 | 操作 | 說明 |
|---|------|------|------|
| 1 | `backend/app/models/session.py` | **Edit** | 新增 6 個音樂欄位 |
| 2 | `backend/app/music.py` | **Create** | 音樂分析工具（librosa） |
| 3 | `backend/app/api/sessions.py` | **Edit** | 新增 music 端點 + start 廣播 |
| 4 | `backend/app/api/ws.py` | **Edit** | broadcast_to_session + 即時分析整合 |
| 5 | `backend/app/analysis/realtime.py` | **Create** | 即時分析管線 |
| 6 | `backend/app/api/assessments.py` | **Edit** | compute 端點改用 rhythm.py / freeze_dance.py |
| 7 | *Alembic migration* | **Generate** | sessions 表新增欄位 |
| 8 | `dashboard/src/hooks/useWebSocket.ts` | **Edit** | 新增 music/rhythm/freeze callback |
| 9 | `dashboard/src/pages/LiveView.tsx` | **Edit** | 節拍指示器 + 音樂資訊顯示 |
| 10 | `dashboard/src/pages/AssessmentIndicators.tsx` | **Edit** | 替換 rhythm/freeze 占位符 |
| 11 | `dashboard/src/pages/SessionDetail.tsx` | **Edit** | 音樂設定 UI |
| 12 | `dashboard/src/api/client.ts` | **Edit** | 新增 uploadSessionMusic 等方法 |

---

## 5. 教師使用流程

```
1. 建立 Session → 選擇教案模板（含 music_element）
2. 在 Session 詳情頁 → 上傳音樂檔 或 輸入 BPM
3. 點「開始上課」
   → 後端分析音樂（~2 秒）
   → WebSocket 廣播音樂資訊到 Dashboard
4. 教師在教室用音響播放「同一首歌」
   → Dashboard 顯示 BPM + 節拍指示器
5. 即時分析：
   → 每 5 秒更新節奏同步率
   → 音樂停止時自動偵測凍結反應
6. 結束課程 → 分析結果存入 AnalysisResult
```

---

## 6. 注意事項

### 時間對齊

最關鍵的問題。教師播放音樂的「起始時間」與後端的「session start_time」可能不同。

**解決方案：**
- Session 開始時，WebSocket 廣播 `{"type":"music", "start_offset": 0}`
- Dashboard 端記錄 `music_start_ts = Date.now()`（教師按下「開始播放」時）
- IMU 的 `ts` 是裝置 epoch ms，與 `music_start_ts` 做差即可對齊
- 後端的 `beat_times` / `stop_times` 都是相對於音樂起始的秒數

### BPM 手動輸入模式

若教師無法上傳音樂檔（例如使用 CD 播放），可手動輸入 BPM：
- beat_times 用 `np.arange(0, duration, 60/bpm)` 推算
- stop_times 為空（凍結偵測不啟用）

### 效能考量

- librosa 分析約需 1-3 秒（視音樂長度）
- `RealtimeAnalyzer` 緩衝區 1500 筆（30 秒 @ 50Hz），記憶體 < 1MB
- 每 5 秒計算一次 rhythm analysis，CPU 佔用低

### 向下相容

- 無音樂設定的 Session 行為不變（音樂欄位為 null）
- assessments.py 的 compute 端點保留原有近似邏輯作為 fallback

---

## 7. 驗證步驟

1. `cd backend && alembic upgrade head` — migration 通過
2. `cd backend && python -c "from app.music import analyze_music; print(analyze_music('test.mp3'))"` — 音樂分析正常
3. 上傳音樂檔 → `GET /api/sessions/{id}` 回傳音樂資訊
4. 開始 Session → WebSocket 收到 `{"type":"music", ...}` 訊息
5. `cd dashboard && npx tsc --noEmit` — TypeScript 編譯通過
6. LiveView 顯示 BPM + 節拍指示器
7. AssessmentIndicators 顯示即時 rhythm_sync_rate 和 freeze 數據
