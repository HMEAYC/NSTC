import { Link } from "react-router-dom";
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
        <Link to="/dashboard/" className="font-bold text-blue-700 text-sm mr-2">HMEAYC</Link>

        {user?.role === "parent" ? (
          <Link to="/dashboard/parent" className="text-blue-600 hover:underline text-sm">我的小孩</Link>
        ) : (
          <>
            {(user?.role === "org_admin" || user?.role === "super_admin" || user?.role === "teacher") && (
              <>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">課程教學</span>
                <Link to="/dashboard/templates" className="text-blue-600 hover:underline text-sm">教案模板</Link>
                <Link to="/dashboard/sessions" className="text-blue-600 hover:underline text-sm">課程管理</Link>
              </>
            )}
            {(user?.role === "org_admin" || user?.role === "super_admin" || user?.role === "teacher") && (
              <>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider ml-1">管理</span>
                <Link to="/dashboard/classes" className="text-blue-600 hover:underline text-sm">班級管理</Link>
                <Link to="/dashboard/devices" className="text-blue-600 hover:underline text-sm">裝置管理</Link>
              </>
            )}
            {(user?.role === "org_admin" || user?.role === "super_admin") && (
              <>
                <span className="text-[11px] text-gray-400 uppercase tracking-wider ml-1">系統</span>
                <Link to="/dashboard/admin/users" className="text-blue-600 hover:underline text-sm">帳號管理</Link>
                {user?.role === "super_admin" && (
                  <Link to="/dashboard/admin" className="text-blue-600 hover:underline text-sm">機構管理</Link>
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
          <Link to="/dashboard/login" className="text-blue-600 hover:underline text-sm">登入</Link>
        )}
      </div>
    </nav>
  );
}
