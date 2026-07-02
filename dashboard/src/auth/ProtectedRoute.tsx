import { Navigate } from "react-router-dom";
import { useAuth } from "./context";
import LoadingSpinner from "../components/LoadingSpinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner text="驗證中…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/dashboard/login" replace />;
  }

  return <>{children}</>;
}

export function RoleRoute({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner text="驗證中…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/dashboard/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/dashboard/" replace />;
  }

  return <>{children}</>;
}
