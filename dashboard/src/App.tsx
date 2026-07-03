import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/context";
import { ProtectedRoute, RoleRoute } from "./auth/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingSpinner from "./components/LoadingSpinner";
import Navbar from "./components/Navbar";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
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
const ChildAssessments = lazy(() => import("./pages/ChildAssessments"));
const ClassAssessments = lazy(() => import("./pages/ClassAssessments"));
const Courses = lazy(() => import("./pages/Courses"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Templates = lazy(() => import("./pages/Templates"));
const CourseReport = lazy(() => import("./pages/CourseReport"));

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
                <Route path="/dashboard/register" element={<Register />} />
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
                <Route path="/dashboard/classes/:classId/assessments" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><ClassAssessments /></RoleRoute>} />
                <Route path="/dashboard/courses" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><Courses /></RoleRoute>} />
                <Route path="/dashboard/courses/:id" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><CourseDetail /></RoleRoute>} />
                <Route path="/dashboard/courses/:id/report" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><CourseReport /></RoleRoute>} />
                <Route path="/dashboard/templates" element={<RoleRoute roles={["org_admin", "super_admin", "teacher"]}><Templates /></RoleRoute>} />
                <Route path="/dashboard/children/:childId/assessments" element={<ProtectedRoute><ChildAssessments /></ProtectedRoute>} />
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
