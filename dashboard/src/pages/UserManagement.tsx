import { useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { getActiveOrgId } from "../lib/activeOrg";
import LoadingSpinner from "../components/LoadingSpinner";
import Modal from "../components/Modal";
import { api } from "../api/client";

interface ManagedUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  org_id: string;
  is_active: boolean;
  invite_token: string | null;
}

const roleLabel: Record<string, string> = {
  super_admin: "系統管理員",
  org_admin: "機構管理員",
  teacher: "教師",
  parent: "家長",
};

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const isSuper = user?.role === "super_admin";
  const myOrgId = user?.org_id || "";
  const effectiveOrgId = isSuper ? (getActiveOrgId() || myOrgId) : myOrgId;

  // invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("teacher");
  const [invSending, setInvSending] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invOk, setInvOk] = useState<string | null>(null);

  // edit modal
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchUsers = async (orgId?: string) => {
    setLoading(true);
    try {
      const targetOrg = orgId || effectiveOrgId;
      const data = await api.listOrgUsers(targetOrg);
      setUsers((data.users || []) as ManagedUser[]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (effectiveOrgId) fetchUsers(effectiveOrgId);
  }, [effectiveOrgId]);

  // ── invite ──
  const handleInvite = async () => {
    if (!invEmail.trim() || !effectiveOrgId) return;
    setInvSending(true);
    setInvError(null);
    setInvOk(null);
    try {
      await api.inviteUser(effectiveOrgId, { email: invEmail, role: invRole });
      setInvOk(`邀請已發送至 ${invEmail}`);
      setInvEmail("");
      fetchUsers();
    } catch (err) {
      setInvError(err instanceof Error ? err.message : "發送失敗");
    } finally {
      setInvSending(false);
    }
  };

  // ── toggle active / save edit ──
  const saveUser = async () => {
    if (!editUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const body: { display_name: string; role?: string } = { display_name: editDisplayName };
      if (isSuper) body.role = editRole;
      await api.updateUser(editUser.id, body);
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (uid: string, current: boolean) => {
    try {
      await api.updateUser(uid, { is_active: !current });
      fetchUsers(effectiveOrgId);
    } catch { /* ignore */ }
  };

  const openEdit = (u: ManagedUser) => {
    setEditUser(u);
    setEditDisplayName(u.display_name || u.email);
    setEditRole(u.role);
    setEditError(null);
  };

  if (!effectiveOrgId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">帳號管理</h1>
        <p className="text-gray-400 text-sm">請先到機構管理選擇機構</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">帳號管理</h1>
        <button onClick={() => { setShowInviteModal(true); setInvError(null); setInvOk(null); }}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
          + 教師邀請
        </button>
      </div>

      {/* ── Invite modal ── */}
      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="教師邀請">
        {invError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{invError}</div>}
        {invOk && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-xs">{invOk}</div>}
        <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
          placeholder="教師 Email" type="email" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <select value={invRole} onChange={(e) => setInvRole(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm">
          <option value="teacher">教師</option>
          <option value="org_admin">機構管理員</option>
        </select>
        <button onClick={handleInvite} disabled={invSending || !invEmail.trim()}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
          {invSending ? "發送中…" : "發送邀請"}
        </button>
      </Modal>

      {/* ── Edit user modal ── */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="編輯帳號">
        {editUser && (
          <div className="space-y-3">
            {editError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{editError}</div>}
            <div className="text-xs text-gray-400">{editUser.email}</div>
            <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="顯示名稱" className="w-full border rounded-lg px-3 py-2 text-sm" />
            {isSuper && (
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {Object.entries(roleLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => toggleActive(editUser.id, editUser.is_active)}
                className={`flex-1 text-sm py-2 rounded-lg ${editUser.is_active ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                {editUser.is_active ? "停用帳號" : "啟用帳號"}
              </button>
              <button onClick={saveUser} disabled={editSaving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
                {editSaving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── User list ── */}
      {loading ? <LoadingSpinner text="載入中…" /> : (
        <div className="space-y-2">
          {users.filter((u) => u.role !== "parent").map((u) => {
            const pending = u.invite_token != null;
            return (
              <div key={u.id} onClick={() => openEdit(u)}
                className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow">
                <div>
                  <div className="font-semibold text-gray-800">{u.display_name || u.email}</div>
                  <div className="text-xs text-gray-400">
                    {u.email} · {roleLabel[u.role] || u.role}
                    {pending && <span className="ml-2 text-amber-600 font-medium">待啟用</span>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                  {u.is_active ? "啟用" : "停用"}
                </span>
              </div>
            );
          })}
          {users.filter((u) => u.role !== "parent").length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">尚無教師帳號</p>
          )}
        </div>
      )}
    </div>
  );
}