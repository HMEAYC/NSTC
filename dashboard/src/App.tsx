import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingSpinner from "./components/LoadingSpinner";

const Landing = lazy(() => import("./pages/Landing"));
const LiveView = lazy(() => import("./pages/LiveView"));
const History = lazy(() => import("./pages/History"));
const Report = lazy(() => import("./pages/Report"));
const AssessmentIndicators = lazy(() => import("./pages/AssessmentIndicators"));
const DeviceManagement = lazy(() => import("./pages/DeviceManagement"));
const FirmwareUpload = lazy(() => import("./pages/FirmwareUpload"));
const WiFiConfig = lazy(() => import("./pages/WiFiConfig"));

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm p-4 flex gap-3 flex-wrap">
          <a href="/dashboard/" className="text-blue-600 hover:underline text-sm">首頁</a>
          <a href="/dashboard/live/default" className="text-blue-600 hover:underline text-sm">即時監控</a>
          <a href="/dashboard/history" className="text-blue-600 hover:underline text-sm">歷史紀錄</a>
          <a href="/dashboard/report/default" className="text-blue-600 hover:underline text-sm"><b>分析報告</b></a>
          <a href="/dashboard/assessment/default" className="text-blue-600 hover:underline text-sm">評估指標</a>
          <a href="/dashboard/devices" className="text-blue-600 hover:underline text-sm">裝置管理</a>
          <a href="/dashboard/firmware" className="text-blue-600 hover:underline text-sm">韌體更新</a>
          <a href="/dashboard/wifi" className="text-blue-600 hover:underline text-sm">WiFi 設定</a>
        </nav>
        <ErrorBoundary>
          <Suspense
            fallback={(
              <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner text="載入頁面中…" />
              </div>
            )}
          >
            <Routes>
              <Route path="/dashboard/" element={<Landing />} />
              <Route path="/dashboard/live/:sessionId" element={<LiveView />} />
              <Route path="/dashboard/history" element={<History />} />
              <Route path="/dashboard/report/:sessionId" element={<Report />} />
              <Route path="/dashboard/assessment/:sessionId" element={<AssessmentIndicators />} />
              <Route path="/dashboard/devices" element={<DeviceManagement />} />
              <Route path="/dashboard/firmware" element={<FirmwareUpload />} />
              <Route path="/dashboard/wifi" element={<WiFiConfig />} />
              <Route path="*" element={<Navigate to="/dashboard/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}
