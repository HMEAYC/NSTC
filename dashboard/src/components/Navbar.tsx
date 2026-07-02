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
    <nav className="bg-white shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex gap-3 flex-wrap">
        <a href="/dashboard/" className="text-blue-600 hover:underline text-sm">首頁</a>
        {user?.role !== "parent" ? (
          <>
            <a href="/dashboard/live/default" className="text-blue-600 hover:underline text-sm">即時監控</a>
            <a href="/dashboard/history" className="text-blue-600 hover:underline text-sm">歷史紀錄</a>
            <a href="/dashboard/report/default" className="text-blue-600 hover:underline text-sm"><b>分析報告</b></a>
            <a href="/dashboard/assessment/default" className="text-blue-600 hover:underline text-sm">評估指標</a>
            <a href="/dashboard/devices" className="text-blue-600 hover:underline text-sm">裝置管理</a>
            <a href="/dashboard/firmware" className="text-blue-600 hover:underline text-sm">韌體更新</a>
            <a href="/dashboard/wifi" className="text-blue-600 hover:underline text-sm">WiFi 設定</a>
          </>
        ) : (
          <a href="/dashboard/parent" className="text-blue-600 hover:underline text-sm">我的小孩</a>
        )}
        {user?.role === "org_admin" || user?.role === "super_admin" ? (
          <>
            <a href="/dashboard/classes" className="text-blue-600 hover:underline text-sm">班級</a>
            <a href="/dashboard/admin/users" className="text-blue-600 hover:underline text-sm">教師</a>
            <a href="/dashboard/admin" className="text-blue-600 hover:underline text-sm">管理</a>
          </>
        ) : null}
        {user?.role === "teacher" ? (
          <a href="/dashboard/classes" className="text-blue-600 hover:underline text-sm">班級</a>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <span className="text-gray-500">{user.display_name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
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
