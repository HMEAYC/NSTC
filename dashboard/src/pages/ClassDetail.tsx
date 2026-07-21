import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import LoadingSpinner from "../components/LoadingSpinner";
import { api } from "../api/client";

interface ChildItem {
  id: string;
  name: string;
  student_id: string | null;
  created_at: string | null;
  notes?: string | null;
}

interface ParentInfo {
  id: string;
  email: string;
  display_name: string;
}

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSid, setNewSid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedChild, setSelectedChild] = useState<ChildItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editSid, setEditSid] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [parents, setParents] = useState<ParentInfo[]>([]);
  const [boundParents, setBoundParents] = useState<ParentInfo[]>([]);
  const [parentQ, setParentQ] = useState("");
  const [editTab, setEditTab] = useState<"edit" | "parent">("edit");

  const orgId = user?.org_id;

  useEffect(() => {
    if (!selectedChild) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedChild(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedChild]);

  const fetchChildren = () => {
    if (!classId) return;
    api.getClassChildren(classId)
      .then((data) => { setChildren(data.children || []); })
      .catch((err) => console.error("Failed to load children:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchChildren(); }, [classId]);

  const isAdmin = user?.role === "org_admin" || user?.role === "super_admin";

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.createClassChild(classId, newName.trim(), newSid || undefined);
      setNewName("");
      setNewSid("");
      setShowAdd(false);
      fetchChildren();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSaving(false);
    }
  };

  const openChild = (c: ChildItem) => {
    setSelectedChild(c);
    setEditName(c.name);
    setEditSid(c.student_id || "");
    setEditNotes(c.notes || "");
    setEditTab("edit");
    setParentQ("");
    setBoundParents([]);
    fetchParents();
    fetchBoundParents(c.id);
  };

  const fetchParents = () => {
    if (!orgId) return;
    api.searchParents(orgId, parentQ)
      .then((data) => setParents(data.parents || []))
      .catch((err) => console.error("Failed to search parents:", err));
  };

  const fetchBoundParents = (childId: string) => {
    api.listChildParents(childId)
      .then((data) => setBoundParents(data.parents || []))
      .catch((err) => console.error("Failed to load bound parents:", err));
  };

  const handleSave = async () => {
    if (!selectedChild) return;
    setSaving(true);
    try {
      const data: { name?: string; student_id?: string; notes?: string } = {};
      if (editName !== selectedChild.name) data.name = editName;
      if (editSid !== (selectedChild.student_id || "")) data.student_id = editSid;
      if (editNotes !== (selectedChild.notes || "")) data.notes = editNotes;
      if (Object.keys(data).length === 0) { setSaving(false); return; }
      await api.updateChild(selectedChild.id, data);
      setSelectedChild(null);
      fetchChildren();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedChild || !confirm(`確定刪除 ${selectedChild.name}？`)) return;
    try {
      await api.deleteChild(selectedChild.id);
      setSelectedChild(null);
      fetchChildren();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  const bindParent = async (parentId: string) => {
    if (!selectedChild) return;
    try {
      await api.bindParent(selectedChild.id, parentId);
      fetchBoundParents(selectedChild.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "綁定失敗");
    }
  };

  const unbindParent = async (parentId: string) => {
    if (!selectedChild) return;
    try {
      await api.unbindParent(selectedChild.id, parentId);
      fetchBoundParents(selectedChild.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解除綁定失敗");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← 返回</button>
          <h1 className="text-2xl font-bold text-gray-800">班級詳細</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Link to={`/dashboard/classes/${classId}/assessments`} className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                評估總覽
              </Link>
              <button onClick={() => setShowAdd(!showAdd)} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
                {showAdd ? "取消" : "+ 新增幼兒"}
              </button>
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">新增幼兒</h3>
          <input type="text" placeholder="姓名" value={newName} onChange={(e) => setNewName(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" placeholder="學號（選填）" value={newSid} onChange={(e) => setNewSid(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">
            {saving ? "儲存中…" : "建立"}
          </button>
        </form>
      )}

      {loading ? <LoadingSpinner text="載入中…" /> : (
        <div className="space-y-2">
          {children.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">尚無幼兒</div>
          ) : children.map((c) => (
            <div key={c.id}
              onClick={() => isAdmin && openChild(c)}
              className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between ${isAdmin ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
            >
              <div>
                <div className="font-semibold text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-400">{c.student_id || "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/dashboard/children/${c.id}/assessments`}
                  className="text-xs text-blue-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}>🎯 評估</Link>
                {isAdmin && <span className="text-blue-500 text-sm">編輯 →</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Child Detail Modal */}
      {selectedChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedChild(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{selectedChild.name}</h2>
              <button onClick={() => setSelectedChild(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              <button onClick={() => setEditTab("edit")}
                className={`flex-1 py-3 text-sm font-medium text-center ${editTab === "edit" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}>編輯資料</button>
              <button onClick={() => setEditTab("parent")}
                className={`flex-1 py-3 text-sm font-medium text-center ${editTab === "parent" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}>家長管理</button>
            </div>

            <div className="p-5 space-y-4">
              {editTab === "edit" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">學號</label>
                    <input type="text" value={editSid} onChange={(e) => setEditSid(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {error && <div className="text-red-600 text-sm">{error}</div>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "儲存中…" : "儲存"}
                    </button>
                    <button onClick={handleDelete}
                      className="px-4 bg-red-50 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-100">
                      刪除
                    </button>
                  </div>
                </>
              )}

              {editTab === "parent" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">已綁定家長</label>
                    {boundParents.length === 0 ? (
                      <div className="text-sm text-gray-400">尚無綁定家長</div>
                    ) : boundParents.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{p.display_name}</div>
                          <div className="text-xs text-gray-400">{p.email}</div>
                        </div>
                        <button onClick={() => unbindParent(p.id)}
                          className="text-xs text-red-500 hover:text-red-700">
                          解除綁定
                        </button>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">搜尋家長</label>
                    <input type="text" placeholder="輸入姓名或 Email 搜尋" value={parentQ}
                      onChange={(e) => setParentQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchParents()}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={fetchParents} className="mt-2 text-sm text-blue-600 hover:underline">搜尋</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {parents.filter((p) => !boundParents.some((bp) => bp.id === p.id)).map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50">
                        <div>
                          <div className="text-sm text-gray-800">{p.display_name}</div>
                          <div className="text-xs text-gray-400">{p.email}</div>
                        </div>
                        <button onClick={() => bindParent(p.id)}
                          className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">
                          綁定
                        </button>
                      </div>
                    ))}
                    {parents.length === 0 && parentQ && (
                      <div className="text-sm text-gray-400 text-center py-4">無符合的家長</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
