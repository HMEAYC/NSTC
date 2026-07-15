import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "../auth/context";
import { api } from "../api/client";

interface ParentChild {
  id: string;
  name: string;
  student_id: string | null;
  class_id: string | null;
  created_at: string | null;
}

export default function ParentView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listMyChildren()
      .then((data) => { setChildren(data.children || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">我的小孩</h1>
      <p className="text-sm text-gray-500">{user?.display_name} 的家長專區</p>

      {loading ? <LoadingSpinner text="載入中…" /> : (
        <div className="space-y-3">
          {children.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">
              尚未綁定幼兒，請聯繫園方。
            </div>
          ) : children.map((c) => (
            <div key={c.id} onClick={() => navigate(`/dashboard/children/${c.id}/assessments`)}
              className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md cursor-pointer">
              <div>
                <div className="font-semibold text-gray-800 text-lg">{c.name}</div>
                <div className="text-xs text-gray-400">{c.student_id || ""}</div>
              </div>
              <span className="text-blue-600 text-sm">檢視報告 →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
