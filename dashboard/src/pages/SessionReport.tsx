import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface ReportData {
  session: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    class_name: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    ended_at: string | null;
  };
  summary: {
    imu_count: number;
    device_count: number;
  };
  assessments: {
    avg_activity_level: number | null;
    avg_smoothness: number | null;
    avg_stability_index: number | null;
  };
  evaluations: {
    child_id: string;
    child_name: string;
    score: number | null;
    comment: string | null;
  }[];
  report: {
    id: string | null;
    status: string;
    markdown: string | null;
    generated_at: string | null;
  } | null;
}

function formatNum(v: number | null | undefined, decimals = 2) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

export default function SessionReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getSessionReport(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll for report completion if status is pending
  useEffect(() => {
    if (!id || !data?.report || data.report.status !== "pending") return;
    const timer = setInterval(() => {
      api.getSessionReport(id)
        .then(setData)
        .catch((err) => console.error("Polling error:", err));
    }, 5000);
    return () => clearInterval(timer);
  }, [id, data?.report?.status]);

  const handleRegenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      await api.generateSessionReport(id);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          report: {
            id: prev.report?.id || null,
            status: "pending",
            markdown: null,
            generated_at: null,
          },
        };
      });
    } catch (e) {
      alert("生成失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入報告…" /></div>;

  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error || "報告不存在"}</div>
        <Link to="/dashboard/sessions" className="text-blue-600 hover:underline text-sm mt-4 inline-block">← 返回課程列表</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link to={`/dashboard/sessions/${id}`} className="text-blue-600 hover:underline text-sm">← 返回課程詳情</Link>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">課程報告：{data.session.name}</h1>
        {data.session.class_name && (
          <p className="text-sm text-gray-500">班級：{data.session.class_name}</p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{data.summary.imu_count.toLocaleString()}</div>
            <div className="text-xs text-blue-600">IMU 資料筆數</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{data.summary.device_count}</div>
            <div className="text-xs text-green-600">使用裝置數</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-700">{data.session.started_at ? new Date(data.session.started_at).toLocaleDateString("zh-TW") : "—"}</div>
            <div className="text-xs text-purple-600">課程日期</div>
          </div>
        </div>
      </div>

      {/* AI development report section */}
      {data.report && data.report.status === "done" && data.report.markdown && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span>🤖</span> AI 發展評估與教學建議
            </h2>
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {generating ? "重新生成中..." : "重新生成報告"}
            </button>
          </div>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 p-5 rounded-lg border border-gray-100">
            {data.report.markdown}
          </div>
        </div>
      )}

      {data.report && data.report.status === "pending" && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center py-10">
          <LoadingSpinner text="AI 發展評估報告正在生成中，請稍候..." />
        </div>
      )}

      {(!data.report || data.report.status === "failed") && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center py-8 space-y-4">
          <h2 className="text-lg font-bold text-gray-800">🤖 AI 發展評估報告</h2>
          <p className="text-sm text-gray-500">此課程尚未產生 AI 發展評估與教學建議報告。</p>
          <button
            onClick={handleRegenerate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {generating ? "正在生成中..." : "開始生成 AI 報告"}
          </button>
        </div>
      )}

      {/* Assessment metrics */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">評估指標</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-gray-800">{formatNum(data.assessments.avg_activity_level)}</div>
            <div className="text-xs text-gray-400">平均活動量</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-gray-800">{formatNum(data.assessments.avg_smoothness)}</div>
            <div className="text-xs text-gray-400">平均平穩度</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-gray-800">{formatNum(data.assessments.avg_stability_index)}</div>
            <div className="text-xs text-gray-400">平均穩定性</div>
          </div>
        </div>
      </div>

      {/* Evaluations */}
      {data.evaluations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">學生評分</h2>
          <table className="w-full text-xs text-gray-600">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">學生</th>
                <th className="pb-2 font-medium">評分</th>
                <th className="pb-2 font-medium">評語</th>
              </tr>
            </thead>
            <tbody>
              {data.evaluations.map((ev) => (
                <tr key={ev.child_id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{ev.child_name}</td>
                  <td className="py-2">{ev.score !== null ? `${ev.score}/100` : "—"}</td>
                  <td className="py-2 text-gray-500">{ev.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
