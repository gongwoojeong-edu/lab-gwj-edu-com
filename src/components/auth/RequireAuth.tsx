import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useViewMode } from "@/hooks/useViewMode";

interface Props {
  children: React.ReactNode;
  /** 이 역할이 있어야 통과. 없으면 접근거부 화면. */
  requireRole?: AppRole;
  /**
   * 학생만 있고 staff 권한(teacher/admin)이 없는 경우 강제 리다이렉트할 경로.
   */
  redirectStudentTo?: string;
  /**
   * staff 권한이 있는 사용자를 (선생님 모드일 때) 자동으로 보낼 경로.
   * 학생화면 모드에서는 무시.
   */
  redirectStaffTo?: string;
}

const isStaff = (roles: AppRole[]) => roles.includes("teacher") || roles.includes("admin");

export const RequireAuth = ({
  children,
  requireRole,
  redirectStudentTo,
  redirectStaffTo,
}: Props) => {
  const { session, roles, loading } = useAuth();
  const location = useLocation();
  const { mode } = useViewMode();

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
  // staff가 학생 모드면 학생 라우트로 보내기 (선생님 라우트 진입 시)
  // 단, 라우트가 명시적으로 requireRole="teacher"|"admin" 을 요구해 통과한 경우는
  // viewMode 와 무관하게 통과시킨다 (예: /teacher/handout/* 새 탭 인쇄).
  const routeRequiresStaff =
    requireRole === "teacher" || requireRole === "admin";
  if (
    !routeRequiresStaff &&
    isStaff(roles) &&
    mode === "student" &&
    location.pathname.startsWith("/teacher")
  ) {
    return <Navigate to="/learn" replace />;
  }
  if (redirectStaffTo && isStaff(roles) && mode === "teacher") {
    return <Navigate to={redirectStaffTo} replace />;
  }
  if (redirectStudentTo && !isStaff(roles)) {
    return <Navigate to={redirectStudentTo} replace />;
  }
  return <>{children}</>;
};
