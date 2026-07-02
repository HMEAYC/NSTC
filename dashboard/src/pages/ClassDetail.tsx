import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";

interface ChildItem {
  id: string;
  name: string;
  student_id: string | null;
  created_at: string | null;
}

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ChildItem[]>([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("hmeayc_token");
  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!classId) return;
    fetch(`/api/classes/${classId}/children`, { headers: authHeaders })
      .then((r) => r.json())
      .then((data) => { setChildren(data.children || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← 返回</button>
        <h1 className="text-2xl font-bold text-gray-800">班級詳細</h1>
      </div>
      {loading ? <LoadingSpinner text="載入中…" /> : (
        <div className="space-y-2">
          {children.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">尚無幼兒</div>
          ) : children.map((c) => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-400">{c.student_id || "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
