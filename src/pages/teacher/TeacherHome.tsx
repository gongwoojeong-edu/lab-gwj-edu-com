import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Users,
  Printer,
  RefreshCcw,
  ClipboardList,
} from "lucide-react";

const TILES = [
  { to: "/teacher/bookshelf", title: "책장", desc: "레벨별 교재 관리", icon: BookOpen },
  { to: "/teacher/students", title: "학생 목록", desc: "학생 진행/권한 관리", icon: Users },
  { to: "/teacher/assignments", title: "교재 부여", desc: "학생에게 교재 배정", icon: ClipboardList },
  { to: "/teacher/print-queue", title: "인쇄 대기열", desc: "시험지 승인·출력", icon: Printer },
  { to: "/teacher/retests", title: "재시험 관리", desc: "단어 테스트 재시도", icon: RefreshCcw },
];

const TeacherHome = () => (
  <TeacherLayout>
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-muted-foreground mt-1">
          왼쪽 사이드바에서 책장(교재 만들기)과 학습관리 메뉴를 선택하세요.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to}>
              <Card className="p-5 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                <Icon className="size-6 text-primary mb-3" />
                <div className="text-base font-bold">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  </TeacherLayout>
);

export default TeacherHome;
