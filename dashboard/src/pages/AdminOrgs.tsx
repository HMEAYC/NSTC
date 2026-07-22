import { useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import LoadingSpinner from "../components/LoadingSpinner";
import { getActiveOrgId, setActiveOrgId } from "../lib/activeOrg";
import { api } from "../api/client";

interface Org {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  is_active: boolean;
  created_at: string | null;
}

export default function AdminOrgs() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchOrgs = () => {
    setLoading(true);
    setError(null);
    api.listOrgs()
      .then((data) => {
        const list = data.orgs || [];
        setOrgs(list as Org[]);
        if (!getActiveOrgId() && list.length > 0) {
          setActiveOrgId(list[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrgs(); }, []);

  const openCreate = () => {
    setEditOrg(null);
    setFormName("");
    setFormCode("");
    setFormEmail("");
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (o: Org) => {
    setEditOrg(o);
    setFormName(o.name);
    setFormCode(o.code);
    setFormEmail(o.contact_email || "");
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCode.trim()) {
      setFormError("名稱與代碼為必填");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editOrg) {
        await api.updateOrg(editOrg.id, { name: formName, code: formCode, contact_email: formEmail || undefined });
      } else {
        await api.createOrg({ name: formName, code: formCode, contact_email: formEmail || undefined });
      }
      setShowModal(false);
      fetchOrgs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (o: Org) => {
    if (!confirm(`確定刪除「${o.name}」？此操作不可回復。`)) return;
    setSaving(true);
    try {
      await api.deleteOrg(o.id);
      setShowModal(false);
      fetchOrgs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">機構管理</h1>
          <p className="text-sm text-gray-500">角色：{user?.role}</p>
        </div>
        <button onClick={openCreate}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          + 新增組織
        </button>
      </div>

      {loading && <LoadingSpinner text="載入中…" />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
          <button onClick={fetchOrgs} className="ml-2 underline">重試</button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">名稱</th>
                <th className="text-left px-4 py-3">代碼</th>
                <th className="text-left px-4 py-3">聯絡 Email</th>
                <th className="text-left px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((o) => (
                <tr key={o.id} onClick={() => openEdit(o)}
                  className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono">{o.code}</td>
                  <td className="px-4 py-3 text-gray-500">{o.contact_email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      o.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {o.is_active ? "啟用" : "停用"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orgs.length === 0 && (
            <p className="text-center text-gray-400 py-8">尚無組織</p>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">
                {editOrg ? "編輯組織" : "新增組織"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <div className="space-y-3">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">
                  {formError}
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">名稱</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例如：快樂幼兒園" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">代碼</label>
                <input value={formCode} onChange={(e) => setFormCode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="例如：happy-kids" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">聯絡 Email</label>
                <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="optional" />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              {editOrg && (
                <button onClick={() => handleDelete(editOrg)} disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">刪除</button>
              )}
              <button onClick={() => setShowModal(false)}
                className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">取消</button>
              <button onClick={handleSave} disabled={saving || !formName.trim() || !formCode.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}