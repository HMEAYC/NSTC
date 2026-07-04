import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";

interface Stats {
  sessions: number;
  devices: number;
  devicesOnline: number;
  children: number;
  activeSessions: number;
}

const roleLabel: Record<string, string> = {
  super_admin: "系統管理員",
  org_admin: "機構管理員",
  teacher: "教師",
  parent: "家長",
};

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-2xl shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, desc, to, color }: { icon: string; title: string; desc: string; to: string; color: string }) {
  return (
    <Link to={to} className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden">
      <div className={`h-1.5 ${color}`} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{icon}</span>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
        <span className="inline-block mt-3 text-sm text-blue-600 font-medium">前往 →</span>
      </div>
    </Link>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ sessions: 0, devices: 0, devicesOnline: 0, children: 0, activeSessions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("hmeayc_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch("/api/sessions", { headers }).then(r => r.ok ? r.json() : { sessions: [] }),
      fetch("/api/devices", { headers }).then(r => r.ok ? r.json() : { devices: [] }),
      fetch("/api/children", { headers }).then(r => r.ok ? r.json() : { children: [] }),
    ]).then(([s, d, c]) => {
      const sessions = s.sessions || [];
      const devices = d.devices || [];
      const children = c.children || [];
      setStats({
        sessions: sessions.length,
        devices: devices.length,
        devicesOnline: devices.filter((dv: any) => dv.status === "online").length,
        children: children.length,
        activeSessions: sessions.filter((ss: any) => ss.status === "active").length,
      });
    }).finally(() => setLoading(false));
  }, []);

  const isParent = user?.role === "parent";
  const isTeacher = user?.role === "teacher";
  const isAdmin = user?.role === "org_admin" || user?.role === "super_admin";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 md:p-8 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {isParent ? "👋 歡迎回來" : "📊 儀表板"}
            </h1>
            <p className="text-blue-100 mt-1 text-sm md:text-base">
              {user?.display_name || "使用者"} · <span className="text-blue-200">{roleLabel[user?.role || ""] || user?.role}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm bg-white/10 rounded-xl px-4 py-2">
            <span className={`w-2 h-2 rounded-full ${loading ? "bg-yellow-400" : "bg-green-400"}`} />
            <span>{loading ? "讀取中…" : "系統正常"}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {!isParent && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon="📋" label="課程總數" value={stats.sessions} color="bg-blue-50" />
          <StatCard icon="🟢" label="進行中" value={stats.activeSessions} color="bg-green-50" />
          <StatCard icon="📡" label="裝置註冊" value={stats.devices} color="bg-purple-50" />
          <StatCard icon="🔵" label="連線中" value={stats.devicesOnline} color="bg-cyan-50" />
          <StatCard icon="👶" label="幼兒人數" value={stats.children} color="bg-amber-50" />
        </div>
      )}

      {/* Parent view */}
      {isParent && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon="👶" label="已綁定幼兒" value={stats.children || "—"} color="bg-amber-50" />
          <StatCard icon="📋" label="課程紀錄" value={stats.sessions} color="bg-blue-50" />
          <StatCard icon="📊" label="報告總數" value={stats.activeSessions} color="bg-green-50" />
        </div>
      )}

      {/* Teaching */}
      {!isParent && (isAdmin || isTeacher) && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">📋 課程教學</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard icon="📝" title="教案模板" desc="建立可重複使用的課程階段模板" to="/dashboard/templates" color="bg-indigo-500" />
            <ActionCard icon="📚" title="課程管理" desc="排程、開課與管理課程生命週期" to="/dashboard/courses" color="bg-blue-500" />
          </div>
        </section>
      )}

      {/* Management */}
      {!isParent && (isAdmin || isTeacher) && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">⚙️ 系統管理</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard icon="🏫" title="班級管理" desc="管理班級、教師與幼兒資料" to="/dashboard/classes" color="bg-cyan-500" />
            <ActionCard icon="📡" title="裝置管理" desc="檢視連線裝置與狀態" to="/dashboard/devices" color="bg-purple-500" />
            {isAdmin && (
              <ActionCard icon="👤" title="帳號管理" desc="建立與管理教師、家長帳號" to="/dashboard/admin/users" color="bg-amber-500" />
            )}
          </div>
        </section>
      )}

      {/* Parent quick links */}
      {isParent && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">👤 我的專區</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ActionCard icon="👶" title="我的小孩" desc="檢視已綁定幼兒的發展報告與歷程" to="/dashboard/parent" color="bg-amber-500" />
          </div>
        </section>
      )}

      {/* Parent: quick start hint */}
      {isParent && stats.children === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-700 font-medium">尚未綁定幼兒</p>
          <p className="text-amber-600 text-sm mt-1">請聯繫園方取得綁定邀請</p>
        </div>
      )}
    </div>
  );
}
