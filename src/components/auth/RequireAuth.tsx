import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  requireRole?: AppRole;
}

export const RequireAuth = ({ children, requireRole }: Props) => {
  const { session, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (requireRole && !roles.includes(requireRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-2xl font-bold mb-2">접근 권한 없음</div>
          <div className="text-muted-foreground">{requireRole} 권한이 필요합니다.</div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};
