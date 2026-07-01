import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
import LiveView from "./pages/LiveView";
import History from "./pages/History";
import Report from "./pages/Report";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm p-4 flex gap-4">
          <a href="/dashboard/" className="text-blue-600 hover:underline">首頁</a>
          <a href="/dashboard/live/default" className="text-blue-600 hover:underline">即時監控</a>
          <a href="/dashboard/history" className="text-blue-600 hover:underline">歷史課程</a>
          <a href="/dashboard/report/default" className="text-blue-600 hover:underline">報告管理</a>
        </nav>
        <ErrorBoundary>
          <Routes>
            <Route path="/dashboard/" element={<Landing />} />
            <Route path="/dashboard/live/:sessionId" element={<LiveView />} />
            <Route path="/dashboard/history" element={<History />} />
            <Route path="/dashboard/report/:sessionId" element={<Report />} />
            <Route path="/dashboard/reports" element={<Report />} />
            <Route path="*" element={<Navigate to="/dashboard/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}
