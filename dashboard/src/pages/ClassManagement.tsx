import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context";
import LoadingSpinner from "../components/LoadingSpinner";
import { api } from "../api/client";

interface ClassItem {
  id: string;
  org_id: string;
  name: string;
  grade: string | null;
  created_at: string | null;
}

export default function ClassManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "" });
  const isSuper = user?.role === "super_admin";
  const isTeacher = user?.role === "teacher";
  const myOrgId = user?.org_id || "";
  const [orgs, setOrgs] = useState<{ id: string; name: string; code: string }[]>([]);
  const [filterOrgId, setFilterOrgId] = useState<string>("");

  const fetchClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAllClasses();
      setClasses(data.classes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    if (isSuper) {
      api.listOrgs().then((d) => setOrgs(d.orgs || [])).catch(() => {});
    }
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !myOrgId) return;
    try {
      await api.createOrgClass(myOrgId, form.name, form.grade || undefined);
      setForm({ name: "", grade: "" });
      setShowCreate(false);
      fetchClasses();
    } catch (err) { console.error("Failed to create class:", err); }
  };

  if (loading && classes.length === 0) {
    return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入班級…" /></div>;
  }

  const filteredClasses = isSuper && filterOrgId
    ? classes.filter((c) => c.org_id === filterOrgId)
    : classes;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">班級管理</h1>
        {!isTeacher && myOrgId && (
          <button onClick={() => setShowCreate(!showCreate)}
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
            {showCreate ? "取消" : "+ 新增班級"}
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>}

      {isSuper && orgs.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">機構篩選：</span>
          <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">全部機構</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
            ))}
          </select>
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="班級名稱" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
            placeholder="年級（選填）" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm">建立</button>
        </div>
      )}

      <div className="space-y-2">
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">
            {myOrgId ? "尚無班級" : "請先到機構管理選擇機構"}
          </div>
        ) : filteredClasses.map((c) => (
          <div key={c.id} onClick={() => navigate(`/dashboard/classes/${c.id}`)}
            className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md cursor-pointer">
            <div>
              <div className="font-semibold text-gray-800">{c.name}</div>
              <div className="text-xs text-gray-400">{c.grade || "—"}</div>
            </div>
            <span className="text-gray-300 text-sm">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}