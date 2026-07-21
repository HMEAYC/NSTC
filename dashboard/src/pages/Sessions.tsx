import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context";
import { getActiveOrgId } from "../lib/activeOrg";
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
  const [form, setForm] = useState({ name: "", class_id: "", template_id: "", scheduled_at: "", description: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const myOrgId = user?.org_id || "";
  const effectiveOrgId = isSuperAdmin ? (getActiveOrgId() || myOrgId) : myOrgId;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const orgId = effectiveOrgId;
      const [sessionsRes, templatesRes, classRes] = await Promise.all([
        api.listSessions(orgId ? { org_id: orgId } : undefined),
        api.listTemplates(),
        effectiveOrgId
          ? api.listOrgClasses(effectiveOrgId).catch(() => ({ classes: [] }))
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

  useEffect(() => { fetchData(); }, [effectiveOrgId]);

  const handleCreate = async () => {
    if (!form.name && !form.template_id) return;
    const dateStr = new Date().toLocaleDateString("zh-TW");
    const className = classList.find((c) => c.id === form.class_id)?.name || "";
    const tplName = templates.find((t) => t.id === form.template_id)?.name || "";
    const autoName = [dateStr, className, tplName].filter(Boolean).join(" ");
    const name = form.name.trim() || autoName;
    const orgParam = effectiveOrgId;
    try {
      await api.createSession({
        name,
        class_id: form.class_id || undefined,
        template_id: form.template_id || undefined,
        scheduled_at: form.scheduled_at || undefined,
        description: form.description || undefined,
        org_id: orgParam || undefined,
      });
      setForm({ name: "", class_id: "", template_id: "", scheduled_at: "", description: "" });
      setShowCreate(false);
      fetchData();
    } catch (err) { console.error("Failed to create session:", err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此課程？此操作無法復原。")) return;
    setDeletingId(id);
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    }
    setDeletingId(null);
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
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="課程名稱（留空自動產生）" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="text-xs text-gray-500">
            {form.name ? "" : `自動名稱：${new Date().toLocaleDateString("zh-TW")} ${classList.find((c) => c.id === form.class_id)?.name || ""} ${templates.find((t) => t.id === form.template_id)?.name || ""}`}
          </div>
            <select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">選擇教案模板（選填）</option>
              {templates.map((t) => {
                const ag = t.stages?.[0]?.age_group;
                return (
                  <option key={t.id} value={t.id}>
                    {ag ? `[${ag}] ` : ""}{t.name}
                  </option>
                );
              })}
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
          <button onClick={handleCreate}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">建立</button>
        </div>
      )}

      <div className="space-y-2">
        {sessions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">尚無課程</div>
          ) : sessions.map((s) => {
          const cfg = statusConfig[s.status] || { label: s.status, color: "bg-gray-100 text-gray-600" };
          return (
            <div key={s.id} onClick={() => navigate(`/dashboard/sessions/${s.id}`)}
              className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md cursor-pointer">
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-semibold text-gray-800">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {isSuperAdmin && s.org_name && (
                      <span className="inline-block bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 mr-2 text-[11px]">{s.org_name}</span>
                    )}
                    {s.scheduled_at
                      ? new Date(s.scheduled_at).toLocaleString("zh-TW")
                      : new Date(s.started_at || s.created_at || "").toLocaleString("zh-TW")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                  disabled={deletingId === s.id}
                  className="text-gray-300 hover:text-red-500 text-sm px-1 disabled:opacity-50"
                  title="刪除課程"
                >
                  {deletingId === s.id ? "…" : "✕"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
