import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

interface ReportData {
  course: {
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
    session_count: number;
    total_imu_records: number;
    unique_devices: number;
  };
  sessions: {
    session_id: string;
    title: string | null;
    status: string;
    start_time: string | null;
    end_time: string | null;
    imu_count: number;
    device_count: number;
    avg_activity_level: number | null;
    avg_smoothness: number | null;
    avg_stability_index: number | null;
  }[];
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

export default function CourseReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getCourseReport(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入報告…" /></div>;

  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error || "報告不存在"}</div>
        <Link to="/dashboard/courses" className="text-blue-600 hover:underline text-sm mt-4 inline-block">← 返回課程列表</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link to={`/dashboard/courses/${id}`} className="text-blue-600 hover:underline text-sm">← 返回課程詳情</Link>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">課程報告：{data.course.name}</h1>
        {data.course.class_name && (
          <p className="text-sm text-gray-500">班級：{data.course.class_name}</p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{data.summary.session_count}</div>
            <div className="text-xs text-blue-600">串流次數</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{data.summary.total_imu_records.toLocaleString()}</div>
            <div className="text-xs text-green-600">IMU 資料筆數</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-700">{data.summary.unique_devices}</div>
            <div className="text-xs text-purple-600">使用裝置數</div>
          </div>
        </div>
      </div>

      {/* Sessions detail */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">各次串流分析</h2>
        <table className="w-full text-xs text-gray-600">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium">標題</th>
              <th className="pb-2 font-medium">開始</th>
              <th className="pb-2 font-medium">IMU</th>
              <th className="pb-2 font-medium">裝置</th>
              <th className="pb-2 font-medium">活動量</th>
              <th className="pb-2 font-medium">平穩度</th>
              <th className="pb-2 font-medium">穩定性</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.session_id} className="border-b last:border-0">
                <td className="py-2">{s.title || "—"}</td>
                <td className="py-2">{s.start_time ? new Date(s.start_time).toLocaleString("zh-TW") : "—"}</td>
                <td className="py-2">{s.imu_count}</td>
                <td className="py-2">{s.device_count}</td>
                <td className="py-2">{formatNum(s.avg_activity_level)}</td>
                <td className="py-2">{formatNum(s.avg_smoothness)}</td>
                <td className="py-2">{formatNum(s.avg_stability_index)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
