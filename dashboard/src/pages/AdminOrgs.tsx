import { useAuth } from "../auth/context";

export default function AdminOrgs() {
  const { user } = useAuth();
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">管理</h1>
      <p className="text-sm text-gray-500">角色：{user?.role}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-2">組織管理</h2>
          <p className="text-sm text-gray-500 mb-4">管理組織、建立班級與教師帳號</p>
          <div className="space-y-2 text-sm">
            <a href="#" className="block text-blue-600 hover:underline">組織列表</a>
            <a href="#" className="block text-blue-600 hover:underline">新增教師</a>
            <a href="#" className="block text-blue-600 hover:underline">班級管理</a>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-2">系統設定</h2>
          <p className="text-sm text-gray-500 mb-4">全域系統設定與監控</p>
          <div className="space-y-2 text-sm">
            <a href="#" className="block text-blue-600 hover:underline">審計日誌</a>
            <a href="#" className="block text-blue-600 hover:underline">匿名化匯出</a>
          </div>
        </div>
      </div>
    </div>
  );
}
