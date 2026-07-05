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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getSessionReport(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);

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
