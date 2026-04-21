import { ReactNode } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  GraduationCap,
  Users,
  ClipboardList,
  Printer,
  RefreshCcw,
  ShieldCheck,
  LayoutDashboard,
  Eye,
  LogOut,
  Sparkles,
  Inbox,
} from "lucide-react";
import { signOut, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/hooks/useViewMode";
import { LEVELS, LEVEL_LABEL } from "@/lib/levels";
import { cn } from "@/lib/utils";
import { usePendingReviewCount } from "@/hooks/usePendingReviewCount";
import { usePendingPrintCount } from "@/hooks/usePendingPrintCount";
import gwjEduLogo from "@/assets/gwj-edu-logo.png";

interface Props {
  children: ReactNode;
}

const TeacherSidebarInner = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const pendingCount = usePendingReviewCount();
  const printCount = usePendingPrintCount();

  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-2 w-full",
      active ? "bg-muted text-primary font-semibold" : "hover:bg-muted/50",
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>대시보드</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher" end className={({ isActive }) => linkCls(isActive)}>
                    <LayoutDashboard className="size-4" />
                    {!collapsed && <span>홈</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1">
            <BookOpen className="size-3.5" />
            {!collapsed && <span>책장</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/teacher/bookshelf"
                    end
                    className={({ isActive }) => linkCls(isActive)}
                  >
                    <BookOpen className="size-4" />
                    {!collapsed && <span>전체 보기</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {LEVELS.map((l) => {
                const to = `/teacher/bookshelf/${l.code}`;
                return (
                  <SidebarMenuItem key={l.code}>
                    <SidebarMenuButton asChild size="sm">
                      <NavLink to={to} className={({ isActive }) => linkCls(isActive)}>
                        <span className="text-[10px] font-mono w-7">{l.code}</span>
                        {!collapsed && <span className="text-xs">{l.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1">
            <GraduationCap className="size-3.5" />
            {!collapsed && <span>학습관리</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/students" className={({ isActive }) => linkCls(isActive)}>
                    <Users className="size-4" />
                    {!collapsed && <span>학생 목록</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/assignments" className={({ isActive }) => linkCls(isActive)}>
                    <ClipboardList className="size-4" />
                    {!collapsed && <span>특별과제</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/print-queue" className={({ isActive }) => linkCls(isActive)}>
                    <Printer className="size-4" />
                    {!collapsed && <span>시험지 요청</span>}
                    {printCount > 0 && (
                      <span className={cn(
                        "ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center",
                        collapsed && "absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 ml-0",
                      )}>
                        {printCount}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/retests" className={({ isActive }) => linkCls(isActive)}>
                    <RefreshCcw className="size-4" />
                    {!collapsed && <span>재시험 관리</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/requests" className={({ isActive }) => linkCls(isActive)}>
                    <Inbox className="size-4" />
                    {!collapsed && <span>정답 대조 요청</span>}
                    {pendingCount > 0 && (
                      <span className={cn(
                        "ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center",
                        collapsed && "absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 ml-0",
                      )}>
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1">
            <ShieldCheck className="size-3.5" />
            {!collapsed && <span>설정</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/answers" className={({ isActive }) => linkCls(isActive)}>
                    <Sparkles className="size-4" />
                    {!collapsed && <span>정답입력기 (구)</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export const TeacherLayout = ({ children }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setMode } = useViewMode();

  const switchToStudent = () => {
    setMode("student");
    navigate("/learn");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <TeacherSidebarInner />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <img
                  src={gwjEduLogo}
                  alt="공우정에듀 로고"
                  width={28}
                  height={28}
                  loading="lazy"
                  className="w-7 h-7 object-contain"
                />
                <div>
                  <div className="text-sm font-bold leading-none">공우정에듀</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {user?.email?.split("@")[0]}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={switchToStudent}>
                <Eye className="w-4 h-4 mr-1" /> 학생화면 보기
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-1" /> 로그아웃
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export { LEVEL_LABEL };
