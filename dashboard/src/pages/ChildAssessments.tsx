import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type AssessmentResultInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

function MetricBox({ label, value, unit, color }: { label: string; value: number | null; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-3 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>
        {value !== null ? value.toFixed(2) : "—"}
        {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function BarChart({ data, label, color, format }: { data: { date: string; value: number }[]; label: string; color: string; format?: (v: number) => string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 0.1);
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{label}</h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                {format ? format(d.value) : d.value.toFixed(2)} ({d.date})
              </div>
              <div style={{ height: `${Math.max(h, 4)}%` }} className={`w-full rounded-t ${color} opacity-80 hover:opacity-100 transition-opacity`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TrendEntry {
  session_id: string;
  date: string | null;
  rhythm_sync_rate: number | null;
  freeze_reaction_time: number | null;
  freeze_stability_score: number | null;
}

export default function ChildAssessments() {
  const { childId } = useParams<{ childId: string }>();
  const [data, setData] = useState<{
    child_name: string;
    assessments: (AssessmentResultInfo & { session_id: string; course_type: string; session_started_at: string | null; template_name?: string | null; music_element?: string | null })[];
  } | null>(null);
  const [trends, setTrends] = useState<Record<string, TrendEntry[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    Promise.all([
      api.getChildAssessments(childId),
      api.getChildAnalysisTrends(childId),
    ])
      .then(([assessRes, trendsRes]) => {
        setData(assessRes);
        setTrends(trendsRes.trends);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [childId]);

  if (loading) return <div className="p-6"><LoadingSpinner text="載入評估記錄…" /></div>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!data) return null;

  const assessments = data.assessments || [];
  const latest = assessments[0] || null;
  const avgAct = assessments.length ? assessments.reduce((s, a) => s + (a.activity_level || 0), 0) / assessments.length : 0;
  const avgSmooth = assessments.length ? assessments.reduce((s, a) => s + (a.smoothness || 0), 0) / assessments.length : 0;
  const avgStab = assessments.length ? assessments.reduce((s, a) => s + (a.stability_index || 0), 0) / assessments.length : 0;

  const activityData = assessments.map((a) => ({
    date: a.session_started_at ? new Date(a.session_started_at).toLocaleDateString("zh-TW") : "",
    value: a.activity_level || 0,
  })).reverse();
  const stabilityData = assessments.map((a) => ({
    date: a.session_started_at ? new Date(a.session_started_at).toLocaleDateString("zh-TW") : "",
    value: a.stability_index || 0,
  })).reverse();

  const trendEntries = Object.entries(trends || {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/dashboard/classes`} className="text-sm text-blue-600 hover:underline">← 班級管理</Link>
        <h1 className="text-2xl font-bold text-gray-800">🎯 {data.child_name} 的評估記錄</h1>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-3 gap-3">
        <MetricBox label="近期活躍度" value={latest?.activity_level ?? null} unit="g" color="text-blue-600" />
        <MetricBox label="近期平穩度" value={latest?.smoothness ?? null} color={latest && latest.smoothness !== null && latest.smoothness < 0.3 ? "text-green-600" : latest && latest.smoothness !== null && latest.smoothness < 0.6 ? "text-yellow-600" : "text-red-600"} />
        <MetricBox label="近期穩定指數" value={latest?.stability_index ?? null} color={latest && latest.stability_index !== null && latest.stability_index >= 0.7 ? "text-green-600" : latest && latest.stability_index !== null && latest.stability_index >= 0.4 ? "text-yellow-600" : "text-red-600"} />
      </div>

      {/* Average */}
      <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-gray-400">平均活躍度</div>
          <div className="font-bold font-mono text-gray-700">{avgAct.toFixed(2)} g</div>
        </div>
        <div>
          <div className="text-gray-400">平均平穩度</div>
          <div className="font-bold font-mono text-gray-700">{avgSmooth.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gray-400">平均穩定指數</div>
          <div className="font-bold font-mono text-gray-700">{avgStab.toFixed(2)}</div>
        </div>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarChart data={activityData} label="活躍度趨勢" color="bg-blue-500" />
        <BarChart data={stabilityData} label="穩定指數趨勢" color="bg-green-500" />
      </div>

      {/* Per-Element Analysis Trends */}
      {trendEntries.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">🎵 音樂元素分析趨勢</h2>
          {trendEntries.map(([element, entries]) => {
            const rhythmData = entries.filter(e => e.rhythm_sync_rate !== null).map(e => ({
              date: e.date ? new Date(e.date).toLocaleDateString("zh-TW") : "",
              value: e.rhythm_sync_rate!,
            }));
            const freezeData = entries.filter(e => e.freeze_reaction_time !== null).map(e => ({
              date: e.date ? new Date(e.date).toLocaleDateString("zh-TW") : "",
              value: e.freeze_reaction_time!,
            }));
            const freezeStabData = entries.filter(e => e.freeze_stability_score !== null).map(e => ({
              date: e.date ? new Date(e.date).toLocaleDateString("zh-TW") : "",
              value: e.freeze_stability_score!,
            }));
            if (rhythmData.length === 0 && freezeData.length === 0) return null;
            return (
              <div key={element} className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{element}</h3>
                <div className="text-xs text-gray-400 mb-3">{entries.length} 次評估</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rhythmData.length > 0 && (
                    <BarChart data={rhythmData} label="節奏同步率" color="bg-purple-500" format={(v) => `${(v * 100).toFixed(0)}%`} />
                  )}
                  {freezeData.length > 0 && (
                    <BarChart data={freezeData} label="靜止反應時間" color="bg-orange-500" />
                  )}
                  {freezeStabData.length > 0 && (
                    <BarChart data={freezeStabData} label="靜止穩定度" color="bg-teal-500" format={(v) => `${(v * 100).toFixed(0)}%`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assessment List */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">📋 歷史評估 ({assessments.length})</h2>
        {assessments.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6">尚無評估記錄</div>
        ) : (
          <div className="space-y-1">
            {assessments.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.session_started_at ? new Date(a.session_started_at).toLocaleDateString("zh-TW") : "—"}
                  </span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{a.course_type}</span>
                  {a.music_element && (
                    <span className="text-xs text-purple-600 truncate max-w-[120px]">{a.music_element}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                  <span className={a.activity_level !== null ? "text-blue-600" : "text-gray-300"}>{a.activity_level?.toFixed(2) ?? "—"}g</span>
                  <span className={a.smoothness !== null && a.smoothness < 0.3 ? "text-green-600" : a.smoothness !== null && a.smoothness < 0.6 ? "text-yellow-600" : "text-gray-300"}>{a.smoothness?.toFixed(2) ?? "—"}</span>
                  <span className={a.stability_index !== null && a.stability_index >= 0.7 ? "text-green-600" : a.stability_index !== null && a.stability_index >= 0.4 ? "text-yellow-600" : "text-gray-300"}>{a.stability_index?.toFixed(2) ?? "—"}</span>
                  <a href={`/dashboard/assessment/${a.session_id}?device=${encodeURIComponent(a.device_id || "")}`} className="text-blue-500 hover:underline">→</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}