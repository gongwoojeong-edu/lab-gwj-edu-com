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
  LayoutDashboard,
  Eye,
  LogOut,
  Inbox,
  FolderArchive,
  CalendarDays,
  AlertTriangle,
  Plug,
} from "lucide-react";
import { signOut, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/hooks/useViewMode";
import { LEVELS, LEVEL_LABEL } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
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
  const { display: levelDisplay } = useLevelLabels();
  const pendingCount = usePendingReviewCount();
  const printCount = usePendingPrintCount();

  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-2 w-full",
      active ? "bg-muted text-primary font-semibold" : "hover:bg-muted/50",
    );

  // 그룹 라벨 활성화 여부 — 그룹 내 어떤 라우트가 활성이면 라벨도 강조
  const dashboardActive = pathname === "/teacher";
  const bookshelfActive = pathname.startsWith("/teacher/bookshelf");
  const learnMgmtActive =
    pathname.startsWith("/teacher/students") ||
    pathname.startsWith("/teacher/results") ||
    pathname.startsWith("/teacher/results-calendar") ||
    pathname.startsWith("/teacher/assignments") ||
    pathname.startsWith("/teacher/inbox") ||
    pathname.startsWith("/teacher/print-queue") ||
    pathname.startsWith("/teacher/requests");

  const groupLabelCls = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 text-sm font-bold transition-colors rounded-md px-2",
      active ? "bg-primary/10 text-primary" : "text-foreground",
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelCls(dashboardActive)}>
            <LayoutDashboard className="size-4" />
            {!collapsed && <span>대시보드</span>}
          </SidebarGroupLabel>
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
          <SidebarGroupLabel className={groupLabelCls(bookshelfActive)}>
            <BookOpen className="size-4" />
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
                const active = isActive(to);
                return (
                  <SidebarMenuItem key={l.code}>
                    <SidebarMenuButton asChild>
                      <NavLink to={to} className={linkCls(active)} title={levelDisplay(l.code)}>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded text-[10px] font-mono font-bold",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/60 text-muted-foreground",
                          )}
                        >
                          {l.code}
                        </span>
                        {!collapsed && (
                          <span className="text-sm">{levelDisplay(l.code)}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelCls(learnMgmtActive)}>
            <GraduationCap className="size-4" />
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
                  <NavLink to="/teacher/results" className={({ isActive }) => linkCls(isActive)}>
                    <FolderArchive className="size-4" />
                    {!collapsed && <span>학습결과</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/results-calendar" className={({ isActive }) => linkCls(isActive)}>
                    <CalendarDays className="size-4" />
                    {!collapsed && <span>학습결과(월간)</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/assignments" end className={({ isActive }) => linkCls(isActive)}>
                    <ClipboardList className="size-4" />
                    {!collapsed && <span>특별과제</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/inbox" className={({ isActive }) => linkCls(isActive)}>
                    <Inbox className="size-4" />
                    {!collapsed && <span>요청확인</span>}
                    {(printCount + pendingCount) > 0 && (
                      <span className={cn(
                        "ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center",
                        collapsed && "absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 ml-0",
                      )}>
                        {printCount + pendingCount}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/stalled" className={({ isActive }) => linkCls(isActive)}>
                    <AlertTriangle className="size-4" />
                    {!collapsed && <span>정체 학생</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/teacher/integrations" className={({ isActive }) => linkCls(isActive)}>
                    <Plug className="size-4" />
                    {!collapsed && <span>외부 연동</span>}
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
