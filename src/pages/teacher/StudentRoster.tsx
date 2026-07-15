import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Search, Settings2 } from "lucide-react";
import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useStaff } from "@/lib/staff-context";
import { rankLabel } from "@/lib/ranks";
import { LEVEL_LABEL } from "@/lib/levels";
import {
  fetchMemberRoster,
  filterRosterForTeacherView,
  type RosterMember,
  type RosterMemberKind,
} from "@/lib/memberRoster";

type KindFilter = "all" | RosterMemberKind;

const StudentRoster = () => {
  const { isViewingAsOther, effectiveTeacherAuthUserId } = useStaff();
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchMemberRoster();
      setMembers(rows);
    } catch (e) {
      toast({
        title: "목록 불러오기 실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const scoped = useMemo(
    () =>
      filterRosterForTeacherView(
        members,
        effectiveTeacherAuthUserId,
        isViewingAsOther,
      ),
    [members, effectiveTeacherAuthUserId, isViewingAsOther],
  );

  const campuses = useMemo(() => {
    const set = new Set<string>();
    for (const m of scoped) {
      if (m.campus) set.add(m.campus);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [scoped]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((m) => {
      if (kindFilter !== "all" && m.kind !== kindFilter) return false;
      if (campusFilter !== "all" && m.campus !== campusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.loginId.includes(q) ||
        (m.englishClass ?? "").toLowerCase().includes(q)
      );
    });
  }, [scoped, query, kindFilter, campusFilter]);

  const counts = useMemo(
    () => ({
      teachers: scoped.filter((m) => m.kind === "teacher").length,
      students: scoped.filter((m) => m.kind === "student").length,
    }),
    [scoped],
  );

  return (
    <TeacherLayout>
      <div className="container max-w-6xl py-8 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">학생관리</p>
            <h1 className="text-2xl font-bold mt-1">학생목록</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Orbit 동기화 기준 영어과 재원생·선생님 계정입니다. 선생님 {counts.teachers}명 · 학생{" "}
              {counts.students}명
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-4 mr-1" />
              )}
              새로고침
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/teacher/students">
                <Settings2 className="size-4 mr-1" />
                학습 설정
              </Link>
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 번호 · 반 검색"
              className="pl-9"
            />
          </div>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="teacher">선생님</SelectItem>
              <SelectItem value="student">학생</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="분원" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 분원</SelectItem>
              {campuses.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 mr-2 animate-spin" />
              불러오는 중…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">구분</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>로그인 번호</TableHead>
                  <TableHead>분원</TableHead>
                  <TableHead>영어반</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>학습 레벨</TableHead>
                  <TableHead>계정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      표시할 항목이 없습니다.{" "}
                      <Link to="/teacher/integrations" className="text-primary underline">
                        Orbit 영어과 동기화
                      </Link>
                      를 실행해 보세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m, idx) => {
                    const prev = idx > 0 ? filtered[idx - 1] : null;
                    const showLevelDivider =
                      m.kind === "student" &&
                      (prev?.kind !== "student" ||
                        (prev?.learningLevel ?? "") !== (m.learningLevel ?? ""));
                    const levelText = m.learningLevel
                      ? `${m.learningLevel}${LEVEL_LABEL[m.learningLevel as keyof typeof LEVEL_LABEL] ? ` · ${LEVEL_LABEL[m.learningLevel as keyof typeof LEVEL_LABEL]}` : ""}`
                      : "레벨 미지정";
                    return (
                      <Fragment key={m.key}>
                        {showLevelDivider && (
                          <TableRow key={`div-${m.key}`} className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={8} className="py-1.5">
                              <span className="text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                                {levelText}
                              </span>
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow key={m.key}>
                          <TableCell>
                            {m.kind === "teacher" ? (
                              <Badge variant="secondary">👩‍🏫 선생님</Badge>
                            ) : (
                              <Badge variant="outline">🎓 학생</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {m.name}
                            {m.kind === "teacher" && m.teacherRank != null && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {rankLabel(m.teacherRank)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <span className="text-muted-foreground">{m.kind === "teacher" ? "gwjt" : "gwj"}</span>
                            {m.loginId}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.campus ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                            {m.englishClass ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">{m.grade ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {m.learningLevel
                              ? `${m.learningLevel}${LEVEL_LABEL[m.learningLevel as keyof typeof LEVEL_LABEL] ? ` · ${LEVEL_LABEL[m.learningLevel as keyof typeof LEVEL_LABEL]}` : ""}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {m.authUserId ? (
                              <Badge variant="secondary" className="text-[10px]">
                                연동됨
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                미연동
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })
                )}

              </TableBody>
            </Table>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          단어·분석 통과 기준 등 학습 설정은{" "}
          <Link to="/teacher/students" className="text-primary underline">
            학습 설정
          </Link>
          메뉴에서 관리합니다.
        </p>
      </div>
    </TeacherLayout>
  );
};

export default StudentRoster;
