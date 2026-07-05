import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context";
import { api, type SessionInfo, type SessionTemplateInfo } from "../api/client";
import LoadingSpinner from "../components/LoadingSpinner";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-gray-100 text-gray-600" },
  scheduled: { label: "排程中", color: "bg-blue-100 text-blue-700" },
  active: { label: "進行中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-purple-100 text-purple-700" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-700" },
};

export default function Sessions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [templates, setTemplates] = useState<SessionTemplateInfo[]>([]);
  const [classList, setClassList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ class_id: "", template_id: "", scheduled_at: "", description: "" });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("hmeayc_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [sessionsRes, templatesRes, classRes] = await Promise.all([
        api.listSessions(),
        api.listTemplates(),
        user?.org_id
          ? fetch(`/api/orgs/${user.org_id}/classes`, { headers }).then(r => r.ok ? r.json() : { classes: [] })
          : Promise.resolve({ classes: [] }),
      ]);
      setSessions(sessionsRes.sessions);
      setTemplates(templatesRes.templates);
      setClassList((classRes.classes || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user?.org_id]);

  const handleCreate = async () => {
    if (!form.template_id) return;
    const dateStr = new Date().toLocaleDateString("zh-TW");
    const className = classList.find((c) => c.id === form.class_id)?.name || "";
    const tplName = templates.find((t) => t.id === form.template_id)?.name || "";
    const name = [dateStr, className, tplName].filter(Boolean).join(" ");
    try {
      await api.createSession({
        name,
        class_id: form.class_id || undefined,
        template_id: form.template_id || undefined,
        scheduled_at: form.scheduled_at || undefined,
        description: form.description || undefined,
      });
      setForm({ class_id: "", template_id: "", scheduled_at: "", description: "" });
      setShowCreate(false);
      fetchData();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><LoadingSpinner text="載入課程…" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">課程列表</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
          {showCreate ? "取消" : "+ 新增課程"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>}

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <div className="text-xs text-gray-500">
            課程名稱將自動產生：<span className="font-mono text-gray-700">
              {new Date().toLocaleDateString("zh-TW")} {classList.find((c) => c.id === form.class_id)?.name || ""} {templates.find((t) => t.id === form.template_id)?.name || ""}
            </span>
          </div>
          <select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">選擇教案模板 *</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">選擇班級（選填）</option>
            {classList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="描述（選填）" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleCreate} disabled={!form.template_id}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">建立</button>
        </div>
      )}

      <div className="space-y-2">
        {(() => {
          const scheduled = sessions.filter((s) => s.scheduled_at);
          return scheduled.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">尚無已排程課程</div>
          ) : scheduled.map((s) => {
          const cfg = statusConfig[s.status] || { label: s.status, color: "bg-gray-100 text-gray-600" };
          return (
            <div key={s.id} onClick={() => navigate(`/dashboard/sessions/${s.id}`)}
              className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md cursor-pointer">
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-semibold text-gray-800">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(s.scheduled_at!).toLocaleString("zh-TW")}
                  </div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
            </div>
          );
        })})()}
      </div>
    </div>
  );
}
