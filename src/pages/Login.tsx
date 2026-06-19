import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  GWJ_LOGIN,
  buildLoginId,
  defaultPasswordFromLoginId,
  digitsOnly,
  loginIdToAuthEmail,
} from "@/lib/gwj-login-id";
import { cn } from "@/lib/utils";

type LoginKind = "teacher" | "student";

function PrefixIdField({
  prefix,
  digits,
  label,
  placeholder,
  value,
  onChange,
  id,
}: {
  prefix: string;
  digits: number;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
        <span className="px-3 flex items-center text-sm font-mono font-bold text-muted-foreground bg-muted/60 border-r border-input select-none">
          {prefix}
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(digitsOnly(e.target.value, digits))}
          placeholder={placeholder}
          inputMode="numeric"
          pattern={`[0-9]{${digits}}`}
          maxLength={digits}
          autoComplete="username"
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono tracking-widest text-base"
        />
      </div>
    </div>
  );
}

const Login = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialKind: LoginKind = searchParams.get("kind") === "student" ? "student" : "teacher";

  const [kind, setKind] = useState<LoginKind>(initialKind);
  const [teacherDigits, setTeacherDigits] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [studentDigits, setStudentDigits] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const studentCfg = GWJ_LOGIN.student;
  const teacherCfg = GWJ_LOGIN.teacher;

  useEffect(() => {
    setKind(searchParams.get("kind") === "student" ? "student" : "teacher");
  }, [searchParams]);

  if (!loading && session) {
    const to = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={to} replace />;
  }

  const loginTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginId = buildLoginId("teacher", teacherDigits);
    if (!loginId) {
      toast({
        title: `번호는 숫자 ${teacherCfg.digits}자리입니다 (예: ${teacherCfg.placeholder})`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToAuthEmail(loginId),
      password: teacherPassword.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "번호 또는 비밀번호가 일치하지 않습니다.",
        description:
          "lab DB에 계정이 없을 수 있습니다. 관리자에게 Orbit 동기화 또는 계정 생성을 요청하세요.",
        variant: "destructive",
      });
      return;
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from?.startsWith("/teacher") ? from : "/teacher", { replace: true });
  };

  const loginStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginId = buildLoginId("student", studentDigits);
    if (!loginId) {
      toast({
        title: `학번은 숫자 ${studentCfg.digits}자리입니다 (예: ${studentCfg.placeholder})`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToAuthEmail(loginId),
      password: studentPassword.trim(),
    });
    setSubmitting(false);
    if (error) {
      const hintId = `gwj${studentDigits.padStart(studentCfg.digits, "0")}`;
      toast({
        title: "학번 또는 비밀번호가 일치하지 않습니다.",
        description: `학번은 앞 0까지 ${studentCfg.digits}자리, 초기 비밀번호는 ${defaultPasswordFromLoginId(hintId)} 입니다.`,
        variant: "destructive",
      });
      return;
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from?.startsWith("/learn") ? from : "/learn", { replace: true });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">로그인</h1>
          <p className="text-sm text-muted-foreground">공우정보카·공우정구문랩과 같은 번호·비밀번호를 사용합니다.</p>
        </div>

        <div className="flex p-1 rounded-xl border border-input bg-muted/30">
          <button
            type="button"
            onClick={() => setKind("teacher")}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors",
              kind === "teacher"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            👩‍🏫 선생님
          </button>
          <button
            type="button"
            onClick={() => setKind("student")}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors",
              kind === "student"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            🎓 학생
          </button>
        </div>

        {kind === "teacher" ? (
          <form onSubmit={loginTeacher} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">👩‍🏫 선생님 로그인</h2>
            </div>
            <PrefixIdField
              id="teacherNo"
              prefix={teacherCfg.prefix}
              digits={teacherCfg.digits}
              label={teacherCfg.label}
              placeholder={teacherCfg.placeholder}
              value={teacherDigits}
              onChange={setTeacherDigits}
            />
            <div className="space-y-1.5">
              <Label htmlFor="teacherPassword">비밀번호</Label>
              <Input
                id="teacherPassword"
                type="password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                초기 비밀번호: 아이디 + 마지막 숫자 (예: gwjt{teacherCfg.placeholder} →{" "}
                {defaultPasswordFromLoginId(`gwjt${teacherCfg.placeholder}`)})
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "로그인 중…" : "로그인"}
            </Button>
          </form>
        ) : (
          <form onSubmit={loginStudent} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">🎓 학생 로그인</h2>
            </div>
            <PrefixIdField
              id="studentNo"
              prefix={studentCfg.prefix}
              digits={studentCfg.digits}
              label={studentCfg.label}
              placeholder={studentCfg.placeholder}
              value={studentDigits}
              onChange={setStudentDigits}
            />
            <div className="space-y-1.5">
              <Label htmlFor="studentPassword">비밀번호</Label>
              <Input
                id="studentPassword"
                type="password"
                value={studentPassword}
                onChange={(e) => setStudentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                학번 {studentCfg.digits}자리(앞 0 포함, 예: 0305) · 초기 비밀번호: 아이디+마지막 숫자 (gwj0305 →
                gwj03055)
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "로그인 중…" : "학습실 입장"}
            </Button>
          </form>
        )}

        <div className="text-sm text-center text-muted-foreground">
          계정이 없나요?{" "}
          <Link to="/signup" className="text-primary underline">
            회원가입
          </Link>
        </div>
      </Card>
    </main>
  );
};

export default Login;
