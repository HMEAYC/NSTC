import { useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useWebSocket, type IMUFrame } from "../hooks/useWebSocket";
import LoadingSpinner from "../components/LoadingSpinner";

const MAX_POINTS = 100;

interface ChartPoint {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
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
  data,
  lines,
  unit,
}: {
  data: ChartPoint[];
  lines: { key: keyof ChartPoint; color: string; name: string }[];
  unit: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="等待 IMU 資料…" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="t"
          tickFormatter={(v) => v.toFixed(1)}
          stroke="#9ca3af"
          fontSize={11}
          label={{ value: "秒", position: "insideBottomRight", offset: -2 }}
        />
        <YAxis stroke="#9ca3af" fontSize={11} unit={unit} />
        <Tooltip
          labelFormatter={(v) => (typeof v === "number" ? `${v.toFixed(1)}s` : v)}
          formatter={(val) => {
            if (typeof val === "number") return [val.toFixed(3), undefined];
            return [String(val), undefined];
          }}
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

export default function LiveView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<ChartPoint[]>([]);
  const [latest, setLatest] = useState<IMUFrame | null>(null);
  const t0Ref = useRef<number | null>(null);

  const onMessage = useCallback((frame: IMUFrame) => {
    if (t0Ref.current === null) t0Ref.current = frame.ts;
    const t = frame.ts - t0Ref.current;
    const pt: ChartPoint = { t, ...frame };
    setData((prev) => {
      const next = [...prev, pt];
      return next.length > MAX_POINTS
        ? next.slice(next.length - MAX_POINTS)
        : next;
    });
    setLatest(frame);
  }, []);

  const sid = sessionId || "default";
  const { status } = useWebSocket(sid, onMessage);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">即時監控</h1>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${statusColor[status]}`} />
          <span className="text-sm text-gray-600">{statusLabel[status]}</span>
          <span className="text-sm text-gray-400 ml-2">Session: {sid}</span>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-6 gap-3 text-sm">
          {[
            { label: "AX", val: latest.ax, unit: "g" },
            { label: "AY", val: latest.ay, unit: "g" },
            { label: "AZ", val: latest.az, unit: "g" },
            { label: "GX", val: latest.gx, unit: "dps" },
            { label: "GY", val: latest.gy, unit: "dps" },
            { label: "GZ", val: latest.gz, unit: "dps" },
          ].map((v) => (
            <div
              key={v.label}
              className="bg-white rounded-lg shadow p-3 text-center"
            >
              <div className="text-gray-500 text-xs">{v.label}</div>
              <div className="text-lg font-semibold font-mono">
                {v.val.toFixed(3)}
              </div>
              <div className="text-gray-400 text-xs">{v.unit}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">
          加速度 (g)
        </h2>
        <IMUChart data={data} lines={accLines} unit="g" />
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">
          角速度 (dps)
        </h2>
        <IMUChart data={data} lines={gyroLines} unit="dps" />
      </div>
    </div>
  );
}
