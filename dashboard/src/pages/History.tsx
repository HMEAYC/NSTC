import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

export interface SessionSummary {
  id: string;
  course_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  imu_count: number;
  device_count: number;
}

const courseLabel: Record<string, string> = {
  march: "行進",
  car: "開車",
};

const statusColor: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  active: "bg-blue-100 text-blue-700",
};

const statusLabel: Record<string, string> = {
  completed: "已完成",
  active: "進行中",
};

export default function History() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchSessions = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listSessions()
      .then((res) => {
        setSessions(res.sessions.filter((s: SessionSummary) => s.imu_count > 0 || s.course_type));
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "載入失敗");
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleEndSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.endSession(id);
      fetchSessions();
    } catch {
      // ignore
    }
  };

  const fmtDuration = (sec: number | null) => {
    if (sec === null) return "—";
    if (sec < 60) return `${sec} 秒`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} 分 ${s} 秒`;
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("zh-TW", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">歷史紀錄</h1>
        </div>
        <LoadingSpinner text="載入中…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">歷史紀錄</h1>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
          <button onClick={fetchSessions} className="ml-2 underline">重試</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">歷史紀錄</h1>
        <button onClick={fetchSessions} className="text-sm text-blue-600 hover:underline">
          重新整理
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-400">尚無課程記錄</p>
          <p className="text-xs text-gray-300 mt-1">ESP32 連線後會自動建立課程</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/dashboard/sessions`)}
              className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[s.status] || "bg-gray-100 text-gray-500"}`}>
                  {statusLabel[s.status] || s.status}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">
                    {courseLabel[s.course_type] || s.course_type}
                  </div>
                  <div className="text-xs text-gray-400 font-mono truncate">
                    {s.id.slice(0, 8)}… · {fmtTime(s.started_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="text-center hidden sm:block">
                  <div className="font-semibold text-gray-700">{s.imu_count.toLocaleString()}</div>
                  <div className="text-gray-400">筆資料</div>
                </div>
                <div className="text-center hidden md:block">
                  <div className="font-semibold text-gray-700">{s.device_count}</div>
                  <div className="text-gray-400">裝置</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-gray-700">{fmtDuration(s.duration_sec)}</div>
                  <div className="text-gray-400">持續</div>
                </div>
                {s.status === "active" && (
                  <button
                    onClick={(e) => handleEndSession(s.id, e)}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200"
                  >
                    結束
                  </button>
                )}
                <span className="text-gray-300">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
