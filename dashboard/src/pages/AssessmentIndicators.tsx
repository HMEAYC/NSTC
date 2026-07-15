import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { useWebSocket, type IMUFrame } from "../hooks/useWebSocket";
import { useLiveMetrics } from "../hooks/useLiveMetrics";
import { api, type AssessmentResultInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

function Badge({ status }: { status: "ready" | "partial" | "missing" }) {
  const m = {
    ready: { bg: "bg-green-100", text: "text-green-700", label: "資料就緒" },
    partial: { bg: "bg-yellow-100", text: "text-yellow-700", label: "部分可用" },
    missing: { bg: "bg-gray-100", text: "text-gray-500", label: "尚無資料" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${m.bg} ${m.text}`}>
      {status === "ready" && "✅"}
      {status === "partial" && "🟡"}
      {status === "missing" && "🚧"}
      {m.label}
    </span>
  );
}

function RatingBadge({ value, green, yellow }: { value: number; green: string; yellow: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      value >= 0.7 ? "bg-green-100 text-green-700" : value >= 0.4 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
    }`}>
      {value >= 0.7 ? "🟢 " : value >= 0.4 ? "🟡 " : "🔴 "}
      {value >= 0.7 ? green : value >= 0.4 ? yellow : "需注意"}
    </span>
  );
}

function SourceCard({ icon, title, desc, status }: { icon: string; title: string; desc: string; status: "ready" | "partial" | "missing" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        <div className="text-xs text-gray-400 truncate">{desc}</div>
      </div>
      <Badge status={status} />
    </div>
  );
}

function MetricCard({
  icon, title, desc, value, unit, rating, ratingGreen, ratingYellow, sparklineData, color, placeholderText,
}: {
  icon: string; title: string; desc: string; value: number | string; unit?: string;
  rating?: number; ratingGreen?: string; ratingYellow?: string;
  sparklineData?: number[]; color?: string; placeholderText?: string;
}) {
  const hasSparkline = sparklineData && sparklineData.length > 1;
  const hasRating = rating !== undefined && ratingGreen && ratingYellow;
  const data = hasSparkline ? sparklineData!.map((v, i) => ({ i, v })) : [];

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <div className="text-sm font-semibold text-gray-800">{title}</div>
              <div className="text-xs text-gray-400">{desc}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold font-mono text-gray-900">
              {value}
              {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
            </div>
          </div>
        </div>

        {hasSparkline && (
          <div className="h-12 -mx-2">
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color || "#3b82f6"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color || "#3b82f6"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v) => [Number(v ?? 0).toFixed(3), title]}
                />
                <Area type="monotone" dataKey="v" stroke={color || "#3b82f6"} strokeWidth={1.5}
                  fill={`url(#grad-${title})`} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {placeholderText && (
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1">
            <span>🚧</span> {placeholderText}
          </div>
        )}

        {hasRating && !placeholderText && rating !== undefined && (
          <div className="mt-2">
            <RatingBadge value={rating} green={ratingGreen!} yellow={ratingYellow!} />
          </div>
        )}
      </div>
    </div>
  );
}

function CVMetricCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold text-gray-700">{title}</span>
      </div>
      <div className="text-xs text-gray-400 mb-2">{desc}</div>
      <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1">
        <span>🚧</span> 需攝影機 + 影像分析
      </div>
    </div>
  );
}

export default function AssessmentIndicators() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const sid = sessionId || "default";
  const deviceFilter = searchParams.get("device") || "";
  const { metrics, onMessage: onMetricsMessage } = useLiveMetrics();
  const onMessage = useCallback((frame: IMUFrame) => {
    setLastDeviceDataMs(Date.now());
    onMetricsMessage(frame);
  }, [onMetricsMessage]);
  const { status: wsStatus, rhythm, freeze } = useWebSocket(sid, onMessage);
  const [savedAssessments, setSavedAssessments] = useState<AssessmentResultInfo[]>([]);
  const [computing, setComputing] = useState(false);
  const [computeDone, setComputeDone] = useState(false);
  const [lastDeviceDataMs, setLastDeviceDataMs] = useState(0);
  const [, refreshTick] = useState(0);

  // Re-render every second to update stale-data detection
  useEffect(() => {
    const id = setInterval(() => refreshTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const deviceOnline = lastDeviceDataMs > 0 && Date.now() - lastDeviceDataMs < 5000;
  const isConnected = deviceOnline || (wsStatus === "connected" && metrics.sampleCount > 0);
  const hasData = metrics.sampleCount > 10;

  useEffect(() => {
    if (sid && sid !== "default") {
      api.getSessionAssessments(sid).then((r) => {
        setSavedAssessments(r.results || []);
        setComputeDone((r.results || []).length > 0);
      }).catch(() => {});
    }
  }, [sid]);

  const handleCompute = async () => {
    if (!sid || sid === "default") return;
    setComputing(true);
    try {
      await api.computeSessionAssessment(sid);
      const r = await api.getSessionAssessments(sid);
      setSavedAssessments(r.results || []);
      setComputeDone(true);
    } catch (err: any) {
      alert("計算失敗：" + (err.message || "請稍後再試"));
    } finally {
      setComputing(false);
    }
  };

  const scopeLabel = deviceFilter
    ? `裝置：${deviceFilter}`
    : sid !== "default"
      ? `課程 Session：${sid.slice(0, 8)}`
      : "所有裝置（即時串流）";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎯 評估指標</h1>
          <p className="text-sm text-gray-500">
            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono mr-2">{scopeLabel}</span>
            <span className="text-xs text-gray-400">
              {hasData ? `${metrics.sampleCount} 筆 / ${metrics.windowSeconds}s 區間` : "等待資料中…"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500" : wsStatus === "connected" ? "bg-yellow-500" : wsStatus === "connecting" ? "bg-yellow-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-500">
            {isConnected ? "IMU 已連線" : wsStatus === "connected" ? "資料等待中…" : wsStatus === "connecting" ? "連線中…" : "未連線"}
          </span>
          <Link to={`/dashboard/live/${sid}${deviceFilter ? `?device=${encodeURIComponent(deviceFilter)}` : ""}`} className="text-xs text-blue-600 hover:underline ml-1">
            📡 即時監控
          </Link>
          <Link to={`/dashboard/history`} className="text-xs text-blue-600 hover:underline ml-2">
            歷史分析 →
          </Link>
        </div>
      </div>

      {/* Source Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SourceCard icon="📡" title="IMU 腰帶" desc="加速度計 + 陀螺儀" status={isConnected ? "ready" : "missing"} />
        <SourceCard icon="🎵" title="音樂分析" desc="拍點偵測 + 停止訊號" status="missing" />
        <SourceCard icon="📹" title="攝影機" desc="姿勢估計 + 群體追蹤" status="missing" />
      </div>

      {/* Computed IMU Indicators */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">🟢 IMU 即時運算</span>
          <span className="text-xs text-gray-400">從即時串流計算，無需外部資料</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon="🏃" title="動作活躍度" desc="加速度 RMS 均方根"
            value={metrics.activityLevel.toFixed(2)} unit="g"
            rating={metrics.activityLevel > 1.0 ? 0.2 : metrics.activityLevel > 0.5 ? 0.55 : 0.9}
            ratingGreen="適中" ratingYellow="偏高"
            sparklineData={metrics.history} color="#3b82f6"
          />
          <MetricCard
            icon="🎯" title="動作平穩度" desc="加速度變異係數"
            value={metrics.smoothness.toFixed(2)}
            rating={metrics.smoothness < 0.3 ? 0.9 : metrics.smoothness < 0.6 ? 0.55 : 0.2}
            ratingGreen="平穩" ratingYellow="普通"
            sparklineData={metrics.history.map(v => v < 0.3 ? 0.9 : v < 0.6 ? 0.55 : 0.2)}
            color={metrics.smoothnessLabel === "smooth" ? "#22c55e" : metrics.smoothnessLabel === "average" ? "#eab308" : "#ef4444"}
          />
          <MetricCard
            icon="⚖️" title="身體穩定指數" desc="反變異係數 (1 − CV)"
            value={metrics.stabilityIndex.toFixed(2)}
            rating={metrics.stabilityIndex}
            ratingGreen="穩定" ratingYellow="尚可"
            sparklineData={metrics.history.map(v => {
              const cv = v;
              return Math.max(0, Math.min(1, 1 - cv));
            })}
            color={metrics.stabilityIndex >= 0.7 ? "#22c55e" : metrics.stabilityIndex >= 0.4 ? "#eab308" : "#ef4444"}
          />
        </div>
      </section>

      {/* Need External Context (music) */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-yellow-700 bg-yellow-50 px-3 py-1 rounded-full">🟡 需音樂參考訊號</span>
          <span className="text-xs text-gray-400">演算法已就緒，等待音樂來源</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            icon="🎵" title="節奏同步誤差" desc="動作波峰 vs 音樂拍點"
            value={rhythm ? `${(rhythm.sync_rate * 100).toFixed(0)}%` : "--"}
            placeholderText={rhythm ? `偵測 ${rhythm.peak_count} / ${rhythm.beat_count} 拍` : "需音樂拍點參考 (BPM + beat tracking)"}
          />
          <MetricCard
            icon="🧊" title="凍結反應/穩定度" desc="音樂停止後反應時間與穩定度"
            value={freeze ? `${freeze.reaction_time.toFixed(2)}s` : "--"}
            placeholderText={freeze ? `穩定度 ${(freeze.stability_score * 100).toFixed(0)}%` : "需音樂停止訊號 (RMS energy drop)"}
          />
        </div>
      </section>

      {/* CV-dependent Indicators */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">🔴 需攝影機資料</span>
          <span className="text-xs text-gray-400">需要 YOLO 姿勢估計 + 群體追蹤</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <CVMetricCard icon="👥" title="團體投入度" desc="活躍比例 (>0.5cm/s)" />
          <CVMetricCard icon="📐" title="隊形穩定度" desc="幾何分類信心均值" />
          <CVMetricCard icon="🗺️" title="空間利用率" desc="3×3 熱區分布離散度" />
          <CVMetricCard icon="🦶" title="步態對稱性" desc="左右腳支撐期比對" />
          <CVMetricCard icon="🧘" title="平衡搖擺面積" desc="質心投影軌跡" />
          <CVMetricCard icon="🤝" title="上下肢協調" desc="PLV 相位鎖定值" />
        </div>
      </section>

      {/* Social / Emotional */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">🔴 需攝影機 + LLM</span>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-gray-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🧠</span>
            <span className="text-sm font-semibold text-gray-700">社交 / 情緒 / 專注力</span>
          </div>
          <div className="text-xs text-gray-400 mb-2">個體同步貢獻、情緒表現、互動頻率、專注持續時間</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {["👤 個體同步貢獻", "😊 情緒表現", "💬 互動頻率", "👀 專注持續時間"].map((item) => (
              <div key={item} className="flex items-center gap-1 text-gray-400 bg-gray-50 rounded-lg px-2 py-1.5">
                <span>🚧</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Saved Assessments */}
      {sid !== "default" && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">📊 伺服器評估</span>
              <span className="text-xs text-gray-400">批次計算並儲存於後端</span>
            </div>
            <button
              onClick={handleCompute}
              disabled={computing}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {computing ? "計算中…" : computeDone ? "重新計算" : "計算評估"}
            </button>
          </div>
          {savedAssessments.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">裝置</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">活躍度</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">平穩度</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">穩定指數</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">樣本數</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">計算時間</th>
                  </tr>
                </thead>
                <tbody>
                  {savedAssessments.map((a) => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-gray-700">{a.device_id}</td>
                      <td className="py-2 px-3 font-mono text-blue-600">{a.activity_level?.toFixed(2)}</td>
                      <td className={`py-2 px-3 font-mono ${a.smoothness !== null && a.smoothness < 0.3 ? "text-green-600" : a.smoothness !== null && a.smoothness < 0.6 ? "text-yellow-600" : "text-red-600"}`}>{a.smoothness?.toFixed(2) ?? "—"}</td>
                      <td className={`py-2 px-3 font-mono ${a.stability_index !== null && a.stability_index >= 0.7 ? "text-green-600" : a.stability_index !== null && a.stability_index >= 0.4 ? "text-yellow-600" : "text-red-600"}`}>{a.stability_index?.toFixed(2) ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-500">{a.sample_count}</td>
                      <td className="py-2 px-3 text-gray-500">{a.computed_at ? new Date(a.computed_at).toLocaleString("zh-TW") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-400">
              {computeDone ? "無評估結果" : "點擊「計算評估」按鈕來分析此課程的 IMU 資料"}
            </div>
          )}
        </section>
      )}

      {/* No data state */}
      {!isConnected && (
        <div className="text-center py-8">
          <LoadingSpinner text="等待 IMU 連線以開始評估…" />
        </div>
      )}
    </div>
  );
}
