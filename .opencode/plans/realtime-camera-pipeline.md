# 即時攝影機管線實作計畫

## 目標

將目前僅支援離線影片分析的攝影機管線升級為**即時串流分析**，讓 YOLO + MediaPipe 在 IMU 即時模式下同步運作，實現完整的穿戴式 + 視覺融合分析。

---

## 架構概覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Teacher Dashboard)                  │
│                                                                 │
│  getUserMedia()  →  Canvas 截圖  →  WebSocket binary  →  後端   │
│  攝影機授權        每 100ms 一幀     JPEG 編碼 (q=0.6)           │
│                                                                 │
│  ←  後端結果                                                ←  │
│  ←  pose_update (骨架座標)                                  ←  │
│  ←  cv_update (6 項 CV 指標)                               ←  │
│  ←  canvas 繪製姿勢疊加                                     ←  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket binary + JSON
┌─────────────────────────────────────────────────────────────────┐
│                        後端 (FastAPI + WebSocket)                │
│                                                                 │
│  /ws/{session_id}  ←  接收 camera_frame binary                  │
│                     │                                           │
│                     ▼                                           │
│  RealtimeVideoAnalyzer                                          │
│  ├─ _frame_buffer: deque[ndarray] (maxlen=300, 30s @ 10fps)    │
│  ├─ YOLO 偵測 (每 5 幀 = 2fps)                                 │
│  ├─ MediaPipe 精化 (每個偵測到的人)                              │
│  ├─ ByteTrack 追蹤                                              │
│  └─ 每 30 幀 (3s) 計算 CV 指標                                  │
│                     │                                           │
│                     ▼ broadcast_to_session()                    │
│  {"type":"pose_update", "poses":[{"person_id":0,               │
│     "keypoints":[[x,y,conf]×17], "bbox":[x1,y1,x2,y2]}]}      │
│  {"type":"cv_update", "metrics":{"engagement":0.7, ...}}        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 現有基礎設施

| 組件 | 狀態 | 說明 |
|------|------|------|
| WebSocket endpoint `/ws/{session_id}` | ✅ 已存在 | 單一 multiplexed 連線，支援 IMU + 音樂 |
| `broadcast_to_session()` | ✅ 已存在 | WS 全播函數 |
| `RealtimeAnalyzer` | ✅ 已存在 | IMU 即時分析器 |
| YOLO `yolov8n-pose.pt` | ✅ 已安裝 | ~6MB，CPU 30-100 FPS |
| MediaPipe `pose_landmarker_lite` | ✅ 已安裝 | float16，自動下載 |
| OpenCV `cv2` | ✅ 已安裝 | 影像處理 |
| ByteTrack | ✅ 已安裝 | `lap>=0.5` 依賴存在 |
| 前端 `useWebSocket` | ✅ 已存在 | 需擴展處理 camera 消息類型 |
| 前端 `LiveView` | ✅ 已存在 | 需加入攝影機預覽區塊 |
| `AssessmentIndicators` | ✅ 已存在 | 6 個 CV 指標 placeholder |

---

## 實作階段

### Phase 1: 後端 — RealtimeVideoAnalyzer 核心

**新增檔案：** `backend/app/analysis/realtime_video.py`

```python
class RealtimeVideoAnalyzer:
    """即時視覺分析器 — 接收攝影機幀，執行 YOLO + MediaPipe。"""

    FRAME_BUFFER_SIZE = 300      # 30s @ 10fps
    YOLO_STRIDE = 5              # 每 5 幀做一次 YOLO 偵測 (~2fps)
    METRICS_INTERVAL = 30        # 每 30 幀計算 CV 指標 (~3s)
    MAX_PERSONS = 10             # 最大人數

    def __init__(self):
        self._yolo = YOLO("yolov8n-pose.pt")
        self._mediapipe = PoseLandmarker(...)  # 從 estimator.py 複用
        self._frame_buffer = deque(maxlen=self.FRAME_BUFFER_SIZE)
        self._pose_buffer = deque(maxlen=self.FRAME_BUFFER_SIZE)  # 最近 N 幀的姿勢結果
        self._tracker = BYTETracker(...)  # ByteTrack 追蹤器
        self._frame_count = 0

    def ingest_frame(self, frame_bgr: ndarray) -> dict | None:
        """
        接收一幀 BGR 圖片。
        每 N 幀執行 YOLO + MediaPipe，每 M 幀計算 CV 指標。
        返回 pose_update 或 cv_update 消息，或 None。
        """
        self._frame_count += 1
        self._frame_buffer.append(frame_bgr)

        if self._frame_count % self.YOLO_STRIDE != 0:
            return None

        # 1. YOLO 偵測所有人
        results = self._yolo(frame_bgr, verbose=False)
        detections = self._extract_detections(results[0])

        # 2. ByteTrack 追蹤
        tracked = self._tracker.update(detections, frame_bgr)

        # 3. MediaPipe 精化每個人的姿勢
        poses = []
        for track in tracked:
            bbox = track.bbox  # [x1, y1, x2, y2]
            keypoints = self._refine_pose(frame_bgr, bbox)
            poses.append({
                "person_id": track.track_id,
                "bbox": bbox.tolist(),
                "keypoints": keypoints,  # COCO-17 格式
            })

        self._pose_buffer.append(poses)

        result = {"type": "pose_update", "poses": poses}

        # 4. 每 METRICS_INTERVAL 幀計算 CV 指標
        if self._frame_count % self.METRICS_INTERVAL == 0:
            metrics = self._compute_cv_metrics()
            result["cv_metrics"] = metrics

        return result
```

**核心設計：**
- YOLO 每 5 幀偵測一次（~2fps），中間幀使用 ByteTrack 預測位置
- MediaPipe 對每個偵測到的人做姿勢精化（裁切 bbox → pose_landmarker_lite → COCO-17）
- CV 指標每 30 幀（~3s）計算一次，避免 CPU 過載

**CV 指標計算（佔位函數）：**
```python
def _compute_cv_metrics(self) -> dict:
    """從最近 30 幀的姿勢歷史計算 6 項 CV 指標。"""
    return {
        "engagement": self._calc_engagement(),       # 活躍比例
        "formation_stability": self._calc_formation(), # 隊形穩定度
        "spatial_utilization": self._calc_spatial(),   # 空間利用率
        "gait_symmetry": self._calc_gait(),            # 步態對稱性
        "balance_sway": self._calc_balance(),          # 平衡搖擺面積
        "limb_coordination": self._calc_coordination() # 上下肢協調
    }
```

---

### Phase 2: 後端 — WebSocket 支援攝影機幀

**修改檔案：** `backend/app/api/ws.py`

新增消息類型：

| 類型 | 方向 | 格式 | 說明 |
|------|------|------|------|
| `camera_frame` | client → server | binary (JPEG) | 攝影機幀 |
| `camera_start` | client → server | JSON `{fps: 10}` | 開始攝影機串流 |
| `camera_stop` | client → server | JSON `{}` | 停止攝影機串流 |
| `pose_update` | server → client | JSON `{poses: [...]}` | 姿勢結果 |
| `cv_update` | server → client | JSON `{metrics: {...}}` | CV 指標 |

**修改 `ws.py`：**
```python
# 新增全域變數
_video_analyzers: dict[str, RealtimeVideoAnalyzer] = {}

# 在 WebSocket handler 中：
async for raw in websocket.iter_bytes():
    # 判斷是 binary (camera frame) 還是 text (JSON)
    if isinstance(raw, bytes):
        # JPEG binary → 解碼 → 送給 video analyzer
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if session_id in _video_analyzers:
            result = _video_analyzers[session_id].ingest_frame(frame)
            if result:
                # 持久化 + 廣播
                if "cv_metrics" in result:
                    # 存到 AnalysisResult DB
                    pass
                await broadcast_to_session(session_id, result, exclude=None)
        continue

    # ... existing JSON message handling
```

**重要：** 改為 `iter_bytes()` 混合模式（binary + text），或保留 `iter_text()` 但用 base64 編碼。建議使用**二進制模式**（效率更高）。

---

### Phase 3: 前端 — 攝影機捕捉 + WebSocket 傳送

**修改檔案：** `dashboard/src/hooks/useWebSocket.ts`

新增：
```typescript
// 攝影機相關
startCamera(fps?: number): void
stopCamera(): void
cameraStatus: "inactive" | "requesting" | "streaming" | "error"
```

**新增檔案：** `dashboard/src/hooks/useCamera.ts`

```typescript
export function useCamera(ws: WebSocket | null) {
  const [cameraStatus, setCameraStatus] = useState<"inactive" | "requesting" | "streaming" | "error">("inactive")
  const [stream, setStream] = useState<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startCamera = async () => {
    setCameraStatus("requesting")
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" }
      })
      setStream(mediaStream)
      setCameraStatus("streaming")

      // 啟動截圖迴圈
      const video = document.createElement("video")
      video.srcObject = mediaStream
      video.play()

      const canvas = canvasRef.current!
      const ctx = canvas.getContext("2d")!
      canvas.width = 640
      canvas.height = 480

      const interval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        ctx.drawImage(video, 0, 0, 640, 480)
        canvas.toBlob((blob) => {
          if (blob) {
            ws.send(blob)  // binary JPEG
          }
        }, "image/jpeg", 0.6)  // 60% quality
      }, 100)  // 10 FPS

      return () => clearInterval(interval)
    } catch (err) {
      setCameraStatus("error")
    }
  }

  return { cameraStatus, startCamera, stopCamera, canvasRef, stream }
}
```

**修改 `useWebSocket.ts`：**
- 新增 `pose_update` 和 `cv_update` 消息處理
- 新增 `poses` 和 `cvMetrics` 狀態
- 新增 `sendBinary(data: ArrayBuffer)` 方法

---

### Phase 4: 前端 — LiveView 攝影機預覽

**修改檔案：** `dashboard/src/pages/LiveView.tsx`

在 Header 下方、6 軸 IMU 卡片上方加入攝影機區塊：

```tsx
{/* 攝影機預覽 */}
<div className="rounded-xl border bg-card p-4">
  <div className="flex items-center justify-between mb-3">
    <h3 className="font-semibold">📷 攝影機</h3>
    <div className="flex gap-2">
      <Button onClick={startCamera} disabled={cameraStatus === "streaming"}>
        {cameraStatus === "streaming" ? "串流中..." : "開啟攝影機"}
      </Button>
      <Button onClick={stopCamera} variant="outline">
        停止
      </Button>
    </div>
  </div>
  <div className="relative">
    <video ref={videoRef} className="w-full rounded-lg" autoPlay muted playsInline />
    <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full" />
    {/* 姿勢骨架疊加在 video 上方 */}
  </div>
</div>
```

**Pose 疊加繪製：** 使用 Canvas 2D API 繪製骨架：
```typescript
function drawPose(ctx: CanvasRenderingContext2D, pose: PoseResult, width: number, height: number) {
  const COCO_SKELETON = [[0,1],[1,2],[2,3],[3,4],[1,5],[5,6],[6,7],[1,8],[8,9],[9,10],[1,11],[11,12],[12,13],[0,14],[14,16],[0,15],[15,17]]

  ctx.strokeStyle = "#00FF00"
  ctx.lineWidth = 2

  for (const [i, j] of COCO_SKELETON) {
    const [x1, y1] = pose.keypoints[i]
    const [x2, y2] = pose.keypoints[j]
    ctx.beginPath()
    ctx.moveTo(x1 * width, y1 * height)
    ctx.lineTo(x2 * width, y2 * height)
    ctx.stroke()
  }
}
```

---

### Phase 5: 前端 — AssessmentIndicators CV 指標

**修改檔案：** `dashboard/src/pages/AssessmentIndicators.tsx`

1. 將 `SourceCard` 攝影機的 `status` 改為從 WebSocket `pose_update` 消息驅動
2. 將 6 個 `CVMetricCard` 的 `value` 改為從 `cv_update` 消息驅動
3. 新增 `CVMetricCard` 的 value/maxValue props

```tsx
<SourceCard
  icon="📹"
  title="攝影機"
  status={lastPoseUpdate ? "ready" : "missing"}
/>
// ...
<CVMetricCard
  icon="👥"
  title="團體投入度"
  value={cvMetrics?.engagement}
  max={1}
  unit=""
/>
```

---

## 效能考量

| 指標 | 目標值 | 說明 |
|------|--------|------|
| 攝影機幀率 | 10 FPS | 前端截圖 + WebSocket 傳送 |
| YOLO 偵測頻率 | 2 FPS | 每 5 幀偵測一次 |
| MediaPipe 精化 | ~10 人/幀 | 每個偵測到的人 |
| CV 指標計算 | 每 3s | 每 30 幀 |
| WebSocket 頻寬 | ~500 KB/s | JPEG q=0.6, 640×480 |
| 後端 CPU | ~30% | YOLOv8n on CPU |
| 延遲 | < 200ms | 從幀捕獲到結果顯示 |

**注意：**
- 如果伺服器有 GPU，YOLO 可用 CUDA 加速（`model.to("cuda")`）
- 無 GPU 時，`yolov8n-pose.pt`（nano）在 CPU 上仍可達到 ~30 FPS
- 可透過 `YOLO_STRIDE` 參數調整偵測頻率以平衡精度和 CPU 使用率

---

## 檔案清單

### 新增
| 檔案 | 說明 |
|------|------|
| `backend/app/analysis/realtime_video.py` | RealtimeVideoAnalyzer 核心類別 |
| `dashboard/src/hooks/useCamera.ts` | 前端攝影機捕捉 hook |
| `backend/alembic/versions/d5e6f7a8b9c0_add_cv_metrics_to_analysis.py` | AnalysisResult 新增 cv_metrics JSON 欄位 |

### 修改
| 檔案 | 說明 |
|------|------|
| `backend/app/api/ws.py` | 接收 binary 幀、初始化 video analyzer、廣播結果 |
| `dashboard/src/hooks/useWebSocket.ts` | 處理 pose_update/cv_update 消息、新增 sendBinary |
| `dashboard/src/pages/LiveView.tsx` | 攝影機預覽 + 姿勢疊加畫布 |
| `dashboard/src/pages/AssessmentIndicators.tsx` | CV 指標從 placeholder 改為真實數據 |
| `dashboard/src/api/client.ts` | 新增 camera 相關 API 方法（如有需要） |

---

## 驗證方式

1. **Phase 1 驗證：** 寫單元測試，用靜態圖片測試 `RealtimeVideoAnalyzer.ingest_frame()` 能正確回傳 pose_update
2. **Phase 2 驗證：** 用 `websocat` 手動送 binary 幀到 WS endpoint，確認後端回傳 pose_update JSON
3. **Phase 3 驗證：** 開啟攝影機，確認 WebSocket 有收到 binary frames
4. **Phase 4 驗證：** LiveView 顯示攝影機預覽 + 疊加綠色骨架
5. **Phase 5 驗證：** AssessmentIndicators 的 6 個 CV 指標有數值顯示

---

## 開發順序

1. **先做 Phase 1 + 2**（後端核心，可獨立測試）
2. **再做 Phase 3 + 4**（前端捕捉 + 視覺化，需要後端運行）
3. **最後做 Phase 5**（CV 指標整合，依賴 Phase 1-4 完成）

建議先完成 Phase 1-2 後做一次 demo，確認姿勢偵測效果再繼續 Phase 3-5。
