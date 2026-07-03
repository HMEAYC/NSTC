import { useAuth } from "../auth/context";

export default function Navbar() {
  const { user, logout } = useAuth();

  const roleLabel: Record<string, string> = {
    super_admin: "系統管理員",
    org_admin: "管理員",
    teacher: "教師",
    parent: "家長",
  };

  return (
    <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between flex-wrap gap-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        <a href="/dashboard/" className="font-bold text-blue-700 text-sm mr-2">HMEAYC</a>

        {user?.role === "parent" ? (
          <a href="/dashboard/parent" className="text-blue-600 hover:underline text-sm">我的小孩</a>
        ) : (
          <>
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">系統</span>
            <a href="/dashboard/history" className="text-blue-600 hover:underline text-sm">歷史紀錄</a>
            <a href="/dashboard/report/default" className="text-blue-600 hover:underline text-sm font-semibold">分析報告</a>
            <a href="/dashboard/devices" className="text-blue-600 hover:underline text-sm">裝置管理</a>

            {(user?.role === "org_admin" || user?.role === "super_admin" || user?.role === "teacher") && (
              <>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider ml-1">組織</span>
                <a href="/dashboard/classes" className="text-blue-600 hover:underline text-sm">班級</a>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider ml-1">課程</span>
                <a href="/dashboard/courses" className="text-blue-600 hover:underline text-sm">課程列表</a>
                <a href="/dashboard/templates" className="text-blue-600 hover:underline text-sm">教案模板</a>
              </>
            )}
            {(user?.role === "org_admin" || user?.role === "super_admin") && (
              <>
                <a href="/dashboard/admin/users" className="text-blue-600 hover:underline text-sm">帳號管理</a>
                {user?.role === "super_admin" && (
                  <a href="/dashboard/admin" className="text-blue-600 hover:underline text-sm">機構管理</a>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <span className="text-gray-500 text-xs hidden sm:inline">{user.display_name}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {roleLabel[user.role] || user.role}
            </span>
            <button onClick={logout} className="text-red-500 hover:underline text-xs">登出</button>
          </>
        ) : (
          <a href="/dashboard/login" className="text-blue-600 hover:underline text-sm">登入</a>
        )}
      </div>
    </nav>
  );
}
