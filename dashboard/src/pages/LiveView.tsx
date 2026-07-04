import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useWebSocket, type IMUFrame } from "../hooks/useWebSocket";
import { api, type SessionDetail } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

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

export default function LiveView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sid = sessionId || "default";

  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [actIdx, setActIdx] = useState(0);
  const [savingAct, setSavingAct] = useState(false);

  useEffect(() => {
    if (sid === "default") return;
    api.getSession(sid).then((d) => {
      setSessionDetail(d);
      setActIdx(d.current_activity_index);
    }).catch(() => {});
  }, [sid]);

  const advanceActivity = (delta: number) => {
    if (!sessionDetail) return;
    const acts = sessionDetail.template_activities;
    if (!acts || acts.length === 0) return;
    const next = Math.max(0, Math.min(acts.length - 1, actIdx + delta));
    setActIdx(next);
    setSavingAct(true);
    api.updateActivity(sid, next).finally(() => setSavingAct(false));
  };

  const [channels, setChannels] = useState<Map<string, DeviceChannel>>(new Map());
  const channelsRef = useRef<Map<string, DeviceChannel>>(new Map());
  const [lastDeviceDataMs, setLastDeviceDataMs] = useState(0);
  const [, refreshTick] = useState(0);

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

  const { status } = useWebSocket(sid, onMessage);

  // At least one device has sent data recently
  const deviceOnline = lastDeviceDataMs > 0 && Date.now() - lastDeviceDataMs < DEVICE_TIMEOUT_MS;

  // Derived status: green only when a device is actually sending data
  const displayStatus: "connected" | "connecting" | "disconnected" =
    deviceOnline ? "connected"
    : lastDeviceDataMs > 0 ? "disconnected"
    : status === "connected" ? "connecting"
    : status;

  const deviceIds = useMemo(() => Array.from(channels.keys()), [channels]);

  const activeDevice = selectedDevice && channels.has(selectedDevice)
    ? selectedDevice
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
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Session:</span>
            <span className="font-mono text-gray-600">{sid.slice(0, 8)}</span>
            <span className="text-gray-300 mx-1">|</span>
            <span className="text-gray-400">裝置:</span>
            <span className="font-semibold text-gray-700">{deviceIds.length}</span>
          </div>
          <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1">
              <a href={`/dashboard/assessment/${sid}${activeDevice ? `?device=${encodeURIComponent(activeDevice)}` : ""}`}
                className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 font-medium">
                🎯 評估指標
              </a>
              <a href="/dashboard/firmware" className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">韌體</a>
              <a href="/dashboard/wifi" className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">WiFi</a>
            </div>
        </div>
      </div>

      {/* Activity tracker — only when session has template activities */}
      {sessionDetail && sessionDetail.template_activities.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">📋 活動流程</h2>
            <span className="text-xs text-gray-400">
              {actIdx + 1} / {sessionDetail.template_activities.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((actIdx + 1) / sessionDetail.template_activities.length) * 100}%` }}
            />
          </div>
          {/* Current activity card */}
          {sessionDetail.template_activities[actIdx] && (
            <div className="border border-blue-100 bg-blue-50 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800 mb-1">
                {sessionDetail.template_activities[actIdx].title}
              </div>
              {sessionDetail.template_activities[actIdx].rhythm_pattern && (
                <div className="text-xs font-mono text-blue-600 mb-1">
                  節奏型: {sessionDetail.template_activities[actIdx].rhythm_pattern}
                </div>
              )}
              <div className="text-xs text-blue-700/70 line-clamp-2">
                {sessionDetail.template_activities[actIdx].content}
              </div>
            </div>
          )}
          {/* Prev / Next buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => advanceActivity(-1)}
              disabled={actIdx <= 0 || savingAct}
              className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              ← 上一個
            </button>
            <button
              onClick={() => advanceActivity(1)}
              disabled={actIdx >= sessionDetail.template_activities.length - 1 || savingAct}
              className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30"
            >
              下一個 →
            </button>
          </div>
        </div>
      )}

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
