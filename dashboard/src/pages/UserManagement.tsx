import { useEffect, useState } from "react";
import LoadingSpinner from "../components/LoadingSpinner";

interface ManagedUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "teacher" });

  const token = localStorage.getItem("hmeayc_token");
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const orgId = "00000000-0000-0000-0000-000000000001";
      const res = await fetch(`/api/orgs/${orgId}/users`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.display_name.trim()) return;
    try {
      const orgId = "00000000-0000-0000-0000-000000000001";
      await fetch(`/api/orgs/${orgId}/users`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(form),
      });
      setForm({ email: "", password: "", display_name: "", role: "teacher" });
      setShowCreate(false);
      fetchUsers();
    } catch { /* ignore */ }
  };

  const toggleActive = async (uid: string, current: boolean) => {
    try {
      await fetch(`/api/users/${uid}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ is_active: !current }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">教師管理</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
          {showCreate ? "取消" : "+ 新增教師"}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email" type="email" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="密碼" type="password" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="顯示名稱" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="teacher">教師</option>
            <option value="org_admin">管理員</option>
          </select>
          <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm">建立</button>
        </div>
      )}

      {loading ? <LoadingSpinner text="載入中…" /> : (
        <div className="space-y-2">
          {users.filter((u) => u.role !== "parent").map((u) => (
            <div key={u.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{u.display_name}</div>
                <div className="text-xs text-gray-400">{u.email} · {u.role}</div>
              </div>
              <button onClick={() => toggleActive(u.id, u.is_active)}
                className={`text-xs px-2 py-1 rounded ${u.is_active ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                {u.is_active ? "停用" : "啟用"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
