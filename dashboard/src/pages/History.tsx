import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SessionSummary } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

export default function History() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .listSessions()
      .then((res) => {
        if (!cancelled) {
          setSessions(res.sessions);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "載入失敗");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">歷史課程</h1>
        <LoadingSpinner text="載入中…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">歷史課程</h1>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
          <button
            onClick={() => window.location.reload()}
            className="ml-2 underline"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">歷史課程</h1>
      {sessions.length === 0 ? (
        <p className="text-gray-400">尚無課程記錄</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-lg shadow p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/dashboard/report/${s.id}`)}
            >
              <div>
                <div className="font-mono text-sm text-gray-500">{s.id}</div>
                <div className="text-sm text-gray-600">
                  {new Date(s.started_at).toLocaleString("zh-TW")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    s.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : s.status === "active"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {s.status}
                </span>
                <span className="text-gray-300">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
