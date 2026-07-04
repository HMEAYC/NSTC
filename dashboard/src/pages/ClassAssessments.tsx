import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

export default function ClassAssessments() {
  const { classId } = useParams<{ classId: string }>();
  const [data, setData] = useState<{
    sessions: {
      session_id: string;
      course_type: string;
      started_at: string | null;
      student_count: number;
      device_count: number;
      avg_activity_level: number;
      avg_smoothness: number;
      avg_stability_index: number;
    }[];
    total_sessions_with_assessments: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) return;
    api.getClassAssessments(classId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [classId]);

  if (loading) return <div className="p-6"><LoadingSpinner text="載入班級評估…" /></div>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!data) return null;

  const sessions = data.sessions || [];
  const totalAct = sessions.length ? sessions.reduce((s, se) => s + se.avg_activity_level, 0) / sessions.length : 0;
  const totalSmooth = sessions.length ? sessions.reduce((s, se) => s + se.avg_smoothness, 0) / sessions.length : 0;
  const totalStab = sessions.length ? sessions.reduce((s, se) => s + se.avg_stability_index, 0) / sessions.length : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/dashboard/classes/${classId}`} className="text-sm text-blue-600 hover:underline">← 班級詳細</Link>
        <h1 className="text-2xl font-bold text-gray-800">🏫 班級評估總覽</h1>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-gray-800">{data.total_sessions_with_assessments}</div>
          <div className="text-xs text-gray-400">已評估課程</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-2xl font-bold text-blue-600">{totalAct.toFixed(2)}</div>
          <div className="text-xs text-gray-400">平均活躍度</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className={`text-2xl font-bold ${totalSmooth < 0.3 ? "text-green-600" : totalSmooth < 0.6 ? "text-yellow-600" : "text-red-600"}`}>{totalSmooth.toFixed(2)}</div>
          <div className="text-xs text-gray-400">平均平穩度</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className={`text-2xl font-bold ${totalStab >= 0.7 ? "text-green-600" : totalStab >= 0.4 ? "text-yellow-600" : "text-red-600"}`}>{totalStab.toFixed(2)}</div>
          <div className="text-xs text-gray-400">平均穩定指數</div>
        </div>
      </div>

      {/* Session List */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">📋 課程評估列表</h2>
        {sessions.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6">尚無已評估的課程</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-600">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">日期</th>
                  <th className="py-2 pr-3">類型</th>
                  <th className="py-2 pr-3">學員數</th>
                  <th className="py-2 pr-3">裝置數</th>
                  <th className="py-2 pr-3">活躍度</th>
                  <th className="py-2 pr-3">平穩度</th>
                  <th className="py-2 pr-3">穩定指數</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {s.started_at ? new Date(s.started_at).toLocaleDateString("zh-TW") : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{s.course_type}</span>
                    </td>
                    <td className="py-2 pr-3">{s.student_count}</td>
                    <td className="py-2 pr-3">{s.device_count}</td>
                    <td className="py-2 pr-3 font-mono">{s.avg_activity_level.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-mono">{s.avg_smoothness.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-mono">{s.avg_stability_index.toFixed(2)}</td>
                    <td className="py-2">
                      <a href={`/dashboard/assessment/${s.session_id}`} className="text-blue-500 hover:underline">詳細</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
