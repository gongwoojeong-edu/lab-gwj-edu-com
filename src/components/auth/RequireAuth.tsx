import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** 이 역할이 있어야 통과. 없으면 접근거부 화면. */
  requireRole?: AppRole;
  /**
   * 학생만 있고 staff 권한(teacher/admin)이 없는 경우 강제 리다이렉트할 경로.
   * 선생님 전용 화면(/)에 학생이 들어오는 것을 차단할 때 사용.
   */
  redirectStudentTo?: string;
}

const isStaff = (roles: AppRole[]) => roles.includes("teacher") || roles.includes("admin");

export const RequireAuth = ({ children, requireRole, redirectStudentTo }: Props) => {
  const { session, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (requireRole && !roles.includes(requireRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <div>
          <div className="text-2xl font-bold mb-2 text-foreground">접근 권한 없음</div>
          <div className="text-muted-foreground">{requireRole} 권한이 필요합니다.</div>
        </div>
      </div>
    );
  }
  if (redirectStudentTo && !isStaff(roles)) {
    return <Navigate to={redirectStudentTo} replace />;
  }
  return <>{children}</>;
};
