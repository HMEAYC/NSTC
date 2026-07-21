import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useWebSocket, type IMUFrame } from "../hooks/useWebSocket";
import { useCamera, type PoseResult } from "../hooks/useCamera";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";
import BeatIndicator from "../components/BeatIndicator";

const MAX_POINTS = 200;
const DEVICE_TIMEOUT_MS = 5000;

interface ChartPoint {
  t: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

interface DeviceChannel {
  deviceId: string;
  data: ChartPoint[];
  latest: IMUFrame | null;
  t0: number | null;
}

const statusColor: Record<string, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500",
  disconnected: "bg-red-500",
};

const statusLabel: Record<string, string> = {
  connected: "已連線",
  connecting: "連線中…",
  disconnected: "未連線",
};

function IMUChart({
  data, lines, unit, height = 256,
}: {
  data: ChartPoint[];
  lines: { key: keyof ChartPoint; color: string; name: string }[];
  unit: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <LoadingSpinner text="等待資料…" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="t"
          tickFormatter={(v: number) => v.toFixed(1)}
          stroke="#9ca3af"
          fontSize={11}
          label={{ value: "秒", position: "insideBottomRight", offset: -2 }}
        />
        <YAxis stroke="#9ca3af" fontSize={11} unit={unit} />
        <Tooltip
          labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
          formatter={(val) => [Number(val ?? 0).toFixed(3)]}
        />
        <Legend iconType="plainline" />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.color}
            name={l.name}
            dot={false}
            isAnimationActive={false}
            strokeWidth={1.5}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const DEVICE_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#f97316", "#a855f7", "#06b6d4"];

const COCO_SKELETON: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], // head
  [5, 6], // shoulders
  [5, 7], [7, 9], // left arm
  [6, 8], [8, 10], // right arm
  [5, 11], [6, 12], // torso
  [11, 12], // hips
  [11, 13], [13, 15], // left leg
  [12, 14], [14, 16], // right leg
];

const POSE_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#f97316", "#a855f7", "#06b6d4", "#ec4899", "#14b8a6"];

function drawPoses(ctx: CanvasRenderingContext2D, poses: PoseResult[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const pose of poses) {
    const color = POSE_COLORS[pose.person_id % POSE_COLORS.length];
    const kp = pose.keypoints;
    if (!kp || kp.length < 17) continue;

    // Draw skeleton
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [i, j] of COCO_SKELETON) {
      const [x1, y1] = kp[i];
      const [x2, y2] = kp[j];
      if ((x1 === 0 && y1 === 0) || (x2 === 0 && y2 === 0)) continue;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw keypoints
    for (let i = 0; i < kp.length; i++) {
      const [x, y] = kp[i];
      if (x === 0 && y === 0) continue;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw bounding box
    if (pose.bbox) {
      const [x1, y1, x2, y2] = pose.bbox;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);

      // Draw person_id label
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - 16, 24, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "10px monospace";
      ctx.fillText(`#${pose.person_id}`, x1 + 2, y1 - 4);
    }
  }
}

export default function LiveView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sid = sessionId || "default";

  useEffect(() => {
    if (sid === "default") return;
    api.listDevices().then((d) => {
      const map: Record<string, string> = {};
      for (const dev of d.devices) {
        map[dev.id] = dev.device_id;
      }
      setDeviceIdMap(map);
    }).catch((err) => console.error("Failed to list devices:", err));
  }, [sid]);

  const [channels, setChannels] = useState<Map<string, DeviceChannel>>(new Map());
  const channelsRef = useRef<Map<string, DeviceChannel>>(new Map());
  const [lastDeviceDataMs, setLastDeviceDataMs] = useState(0);
  const [, refreshTick] = useState(0);
  const [deviceIdMap, setDeviceIdMap] = useState<Record<string, string>>({});

  // Re-render every second to update stale-data detection
  useEffect(() => {
    const id = setInterval(() => refreshTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedDevice = searchParams.get("device") || "";

  const onMessage = useCallback((frame: IMUFrame & { device_id?: string }) => {
    const deviceId = frame.device_id || "unknown";
    const ch = channelsRef.current.get(deviceId);
    if (!ch) {
      const newCh: DeviceChannel = {
        deviceId,
        data: [],
        latest: null,
        t0: null,
      };
      channelsRef.current.set(deviceId, newCh);
    }
    const channel = channelsRef.current.get(deviceId)!;

    if (channel.t0 === null) channel.t0 = frame.ts;
    const t = frame.ts - channel.t0;
    const pt: ChartPoint = { t, ax: frame.ax, ay: frame.ay, az: frame.az, gx: frame.gx, gy: frame.gy, gz: frame.gz };
    channel.data = [...channel.data, pt].slice(-MAX_POINTS);
    channel.latest = frame;

    setLastDeviceDataMs(Date.now());
    // Batch update
    setChannels(new Map(channelsRef.current));
  }, []);

  const { status, send, sendBinary, music, rhythm, freeze, poses, cvMetrics, sendMusicStart } = useWebSocket(sid, onMessage);

  const { cameraStatus, startCamera, stopCamera, stream } = useCamera(send, sendBinary, status === "connected");

  // Draw poses on canvas overlay
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = poseCanvasRef.current;
    if (!canvas || !stream) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPoses(ctx, poses, canvas.width, canvas.height);
  }, [poses, stream]);

  // At least one device has sent data recently
  const deviceOnline = lastDeviceDataMs > 0 && Date.now() - lastDeviceDataMs < DEVICE_TIMEOUT_MS;

  // Derived status: green only when a device is actually sending data
  const displayStatus: "connected" | "connecting" | "disconnected" =
    deviceOnline ? "connected"
    : lastDeviceDataMs > 0 ? "disconnected"
    : status === "connected" ? "connecting"
    : status;

  const deviceIds = useMemo(() => Array.from(channels.keys()), [channels]);

  const resolvedDevice = selectedDevice
    ? (channels.has(selectedDevice) ? selectedDevice : deviceIdMap[selectedDevice] || "")
    : "";
  const activeDevice = resolvedDevice && channels.has(resolvedDevice)
    ? resolvedDevice
    : deviceIds[0] || "";

  const currentChannel = activeDevice ? channels.get(activeDevice) : null;
  const currentData = currentChannel?.data || [];
  const currentLatest = currentChannel?.latest || null;

  const accLines = [
    { key: "ax" as const, color: "#ef4444", name: "AX" },
    { key: "ay" as const, color: "#22c55e", name: "AY" },
    { key: "az" as const, color: "#3b82f6", name: "AZ" },
  ];
  const gyroLines = [
    { key: "gx" as const, color: "#f97316", name: "GX" },
    { key: "gy" as const, color: "#a855f7", name: "GY" },
    { key: "gz" as const, color: "#06b6d4", name: "GZ" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">即時監控</h1>
          <span className={`w-3 h-3 rounded-full ${statusColor[displayStatus]}`} />
          <span className="text-sm text-gray-600">{statusLabel[displayStatus]}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">Session:</span>
          <span className="font-mono text-gray-600">{sid.slice(0, 8)}</span>
          <div className="flex items-center gap-1">
            <a href={`/dashboard/assessment/${sid}${activeDevice ? `?device=${encodeURIComponent(activeDevice)}` : ""}`}
              className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 font-medium">
              🎯 評估指標
            </a>
            <a href="/dashboard/firmware" className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">韌體</a>
          </div>
        </div>
      </div>

      {/* Device selector */}
      {deviceIds.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {deviceIds.map((did, i) => (
            <button
              key={did}
              onClick={() => setSearchParams({ device: did })}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activeDevice === did
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ backgroundColor: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
              {did}
            </button>
          ))}
        </div>
      )}

      {/* Camera preview */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">📷 攝影機</h2>
            <span className={`w-2 h-2 rounded-full ${
              cameraStatus === "streaming" ? "bg-green-500" :
              cameraStatus === "requesting" ? "bg-yellow-500 animate-pulse" :
              cameraStatus === "error" ? "bg-red-500" : "bg-gray-300"
            }`} />
            {cameraStatus === "streaming" && cvMetrics && (
              <span className="text-xs text-gray-400">
                {poses.length} 人 | {cvMetrics.engagement > 0.7 ? "🟢 高投入" : cvMetrics.engagement > 0.4 ? "🟡 中投入" : "🔴 低投入"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {cameraStatus !== "streaming" ? (
              <button
                onClick={startCamera}
                disabled={cameraStatus === "requesting" || status !== "connected"}
                className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 font-medium"
              >
                {cameraStatus === "requesting" ? "授權中..." : "開啟攝影機"}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="text-xs px-3 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 font-medium"
              >
                停止
              </button>
            )}
          </div>
        </div>

        {stream ? (
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
            <video
              ref={(el) => {
                if (el && stream) {
                  el.srcObject = stream;
                   el.play().catch((err) => console.error("Failed to play video:", err));
                }
              }}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
            <canvas
              ref={poseCanvasRef}
              width={640}
              height={480}
              className="absolute inset-0 w-full h-full"
            />
            {cvMetrics && (
              <div className="absolute bottom-2 left-2 right-2 flex gap-2 flex-wrap">
                {([
                  { label: "投入", value: cvMetrics.engagement },
                  { label: "隊形", value: cvMetrics.formation_stability },
                  { label: "空間", value: cvMetrics.spatial_utilization },
                  { label: "步態", value: cvMetrics.gait_symmetry },
                  { label: "平衡", value: cvMetrics.balance_sway },
                  { label: "協調", value: cvMetrics.limb_coordination },
                ] as const).map((m) => (
                  <span key={m.label} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    m.value >= 0.7 ? "bg-green-600/80 text-white" :
                    m.value >= 0.4 ? "bg-yellow-600/80 text-white" :
                    "bg-red-600/80 text-white"
                  }`}>
                    {m.label} {(m.value * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg text-gray-400 text-sm">
            {cameraStatus === "error"
              ? "攝影機授權失敗，請檢查瀏覽器設定"
              : "點擊「開啟攝影機」以啟動即時視覺分析"}
          </div>
        )}
      </div>

      {/* 6-axis cards */}
      {currentLatest && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-sm">
          {[
            { label: "AX", val: currentLatest.ax, unit: "g" },
            { label: "AY", val: currentLatest.ay, unit: "g" },
            { label: "AZ", val: currentLatest.az, unit: "g" },
            { label: "GX", val: currentLatest.gx, unit: "dps" },
            { label: "GY", val: currentLatest.gy, unit: "dps" },
            { label: "GZ", val: currentLatest.gz, unit: "dps" },
          ].map((v) => (
            <div key={v.label} className="bg-white rounded-lg shadow p-3 text-center">
              <div className="text-gray-500 text-xs">{v.label}</div>
              <div className="text-lg font-semibold font-mono">{v.val.toFixed(3)}</div>
              <div className="text-gray-400 text-xs">{v.unit}</div>
            </div>
          ))}
        </div>
      )}

      {/* Music info + Beat indicator */}
      {music && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500">🎵 音樂資訊</h2>
            <button
              onClick={sendMusicStart}
              className="text-xs px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600 font-medium"
            >
              ▶ 播放開始
            </button>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-400">BPM: </span>
              <span className="font-semibold text-gray-700">{music.bpm}</span>
            </div>
            <div>
              <span className="text-gray-400">時長: </span>
              <span className="font-semibold text-gray-700">{music.duration}s</span>
            </div>
            {music.element && (
              <div>
                <span className="text-gray-400">元素: </span>
                <span className="font-semibold text-gray-700">{music.element}</span>
              </div>
            )}
            <div>
              <span className="text-gray-400">節拍數: </span>
              <span className="font-semibold text-gray-700">{music.beatTimes.length}</span>
            </div>
            <div>
              <span className="text-gray-400">停止點: </span>
              <span className="font-semibold text-gray-700">{music.stopTimes.length}</span>
            </div>
          </div>
          <BeatIndicator
            bpm={music.bpm}
            beatTimes={music.beatTimes}
            rhythmSync={rhythm?.sync_rate}
          />
          {rhythm && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>同步率: <span className="font-semibold text-blue-600">{(rhythm.sync_rate * 100).toFixed(0)}%</span></span>
              <span>偵測節拍: {rhythm.peak_count}</span>
              <span>音樂節拍: {rhythm.beat_count}</span>
            </div>
          )}
          {freeze && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>停止時間: {freeze.stop_time.toFixed(1)}s</span>
              <span>反應時間: <span className="font-semibold text-orange-600">{freeze.reaction_time.toFixed(2)}s</span></span>
              <span>穩定度: <span className="font-semibold text-green-600">{(freeze.stability_score * 100).toFixed(0)}%</span></span>
            </div>
          )}
          {/* Music Player */}
          {music.url && (
            <div className="pt-2 border-t border-gray-100">
              {music.url.includes("youtube.com") || music.url.includes("youtu.be") ? (
                <div className="w-full aspect-video rounded-lg overflow-hidden max-h-48">
                  <iframe
                    src={`https://www.youtube.com/embed/${music.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] || ""}`}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <audio controls src={music.url} className="w-full" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Device info row */}
      {activeDevice && currentLatest && (
        <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm text-blue-700 flex items-center gap-3">
          <span className="font-semibold">📡 {activeDevice}</span>
          <span className="text-blue-400">|</span>
          <span>取樣: {deviceIds.length > 1 ? "多裝置" : `${currentData.length} 筆`}</span>
          {currentLatest.ts && (
            <>
              <span className="text-blue-400">|</span>
              <span className="font-mono text-xs">ts: {new Date(currentLatest.ts).toLocaleTimeString("zh-TW")}</span>
            </>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">
          加速度 (g) {activeDevice ? `— ${activeDevice}` : ""}
        </h2>
        <IMUChart data={currentData} lines={accLines} unit="g" />
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">
          角速度 (dps) {activeDevice ? `— ${activeDevice}` : ""}
        </h2>
        <IMUChart data={currentData} lines={gyroLines} unit="dps" />
      </div>

      {/* Device overview */}
      {deviceIds.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">📊 多裝置概覽</h2>
          <div className="space-y-2">
            {deviceIds.map((did, i) => {
              const ch = channels.get(did);
              const lat = ch?.latest;
              return (
                <div
                  key={did}
                  className={`flex items-center justify-between text-sm p-2 rounded-lg cursor-pointer ${
                    activeDevice === did ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
                  }`}
                  onClick={() => setSearchParams({ device: did })}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                    <span className="font-medium text-gray-700">{did}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{ch?.data.length || 0} 筆</span>
                    {lat && <span>{lat.ax.toFixed(2)}, {lat.ay.toFixed(2)}, {lat.az.toFixed(2)} g</span>}
                    <span className="text-blue-600 text-xs">→ 檢視</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deviceIds.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-400">等待裝置連線…</p>
          <p className="text-xs text-gray-300 mt-1">ESP32 開機後會自動連線至此頁面</p>
        </div>
      )}
    </div>
  );
}
