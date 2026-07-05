import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) setError("邀請連結無效（缺少 token）");
  }, [token]);

  const handleSubmit = async () => {
    if (!displayName.trim()) { setError("請輸入顯示名稱"); return; }
    if (password.length < 6) { setError("密碼至少 6 個字元"); return; }
    if (password !== confirm) { setError("兩次密碼輸入不一致"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/complete-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, display_name: displayName }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem("hmeayc_token", data.access_token);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full text-center space-y-3">
          <div className="text-green-600 text-lg font-bold">✓ 啟用成功</div>
          <Link to="/dashboard/" className="text-blue-600 underline text-sm">前往首頁</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full space-y-4">
        <h1 className="text-xl font-bold text-center text-gray-800">設定您的帳號</h1>
        <p className="text-xs text-gray-400 text-center">請設定顯示名稱及密碼以啟用帳號</p>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{error}</div>}
        {!token && <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg p-3 text-xs">邀請連結不完整</div>}
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          placeholder="顯示名稱" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={password} onChange={(e) => setPassword(e.target.value)}
          type="password" placeholder="密碼（至少 6 字元）" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)}
          type="password" placeholder="確認密碼" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <button onClick={handleSubmit} disabled={submitting || !token}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
          {submitting ? "設定中…" : "啟用帳號"}
        </button>
      </div>
    </div>
  );
}