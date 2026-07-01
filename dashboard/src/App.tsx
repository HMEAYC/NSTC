import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LiveView from "./pages/LiveView";
import History from "./pages/History";
import Report from "./pages/Report";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm p-4 flex gap-4">
          <a href="/dashboard/live/test" className="text-blue-600 hover:underline">即時監控</a>
          <a href="/dashboard/history" className="text-blue-600 hover:underline">歷史課程</a>
          <a href="/dashboard/reports" className="text-blue-600 hover:underline">報告管理</a>
        </nav>
        <Routes>
          <Route path="/dashboard/live/:sessionId" element={<LiveView />} />
          <Route path="/dashboard/history" element={<History />} />
          <Route path="/dashboard/reports" element={<Report />} />
          <Route path="*" element={<Navigate to="/dashboard/live/test" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
