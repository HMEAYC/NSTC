import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/context";
import { ProtectedRoute, RoleRoute } from "./auth/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingSpinner from "./components/LoadingSpinner";
import Navbar from "./components/Navbar";

const Login = lazy(() => import("./pages/Login"));
const Landing = lazy(() => import("./pages/Landing"));
const LiveView = lazy(() => import("./pages/LiveView"));
const History = lazy(() => import("./pages/History"));
const Report = lazy(() => import("./pages/Report"));
const AssessmentIndicators = lazy(() => import("./pages/AssessmentIndicators"));
const DeviceManagement = lazy(() => import("./pages/DeviceManagement"));
const FirmwareUpload = lazy(() => import("./pages/FirmwareUpload"));
const WiFiConfig = lazy(() => import("./pages/WiFiConfig"));
const AdminOrgs = lazy(() => import("./pages/AdminOrgs"));
const ClassManagement = lazy(() => import("./pages/ClassManagement"));
const ClassDetail = lazy(() => import("./pages/ClassDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ParentView = lazy(() => import("./pages/ParentView"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <ErrorBoundary>
            <Suspense
              fallback={(
                <div className="min-h-[60vh] flex items-center justify-center">
                  <LoadingSpinner text="載入頁面中…" />
                </div>
              )}
            >
              <Routes>
                <Route path="/dashboard/login" element={<Login />} />
                <Route path="/dashboard/" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
                <Route path="/dashboard/live/:sessionId" element={<ProtectedRoute><LiveView /></ProtectedRoute>} />
                <Route path="/dashboard/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
                <Route path="/dashboard/report/:sessionId" element={<ProtectedRoute><Report /></ProtectedRoute>} />
                <Route path="/dashboard/assessment/:sessionId" element={<ProtectedRoute><AssessmentIndicators /></ProtectedRoute>} />
                <Route path="/dashboard/devices" element={<ProtectedRoute><DeviceManagement /></ProtectedRoute>} />
                <Route path="/dashboard/firmware" element={<ProtectedRoute><FirmwareUpload /></ProtectedRoute>} />
                <Route path="/dashboard/wifi" element={<ProtectedRoute><WiFiConfig /></ProtectedRoute>} />
                <Route path="/dashboard/admin" element={<RoleRoute roles={["org_admin", "super_admin"]}><AdminOrgs /></RoleRoute>} />
                <Route path="/dashboard/classes" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><ClassManagement /></RoleRoute>} />
                <Route path="/dashboard/classes/:classId" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><ClassDetail /></RoleRoute>} />
                <Route path="/dashboard/admin/users" element={<RoleRoute roles={["org_admin", "super_admin"]}><UserManagement /></RoleRoute>} />
                <Route path="/dashboard/parent" element={<RoleRoute roles={["parent"]}><ParentView /></RoleRoute>} />
                <Route path="*" element={<Navigate to="/dashboard/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
