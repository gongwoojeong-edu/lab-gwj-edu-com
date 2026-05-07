import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { loginSchema, studentNoToEmail } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const Login = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [studentNo, setStudentNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    const to = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={to} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 4자리만 입력해도, 전체(gwj0211)로 입력해도 모두 허용
    const raw = studentNo.trim().toLowerCase();
    const normalized = raw.startsWith("gwj") ? raw : `gwj${raw}`;
    const parsed = loginSchema.safeParse({ studentNo: normalized, password: password.trim() });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0]?.message ?? "입력 오류", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: studentNoToEmail(parsed.data.studentNo),
      password: parsed.data.password,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "학번 또는 비밀번호가 올바르지 않습니다", variant: "destructive" });
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">로그인</h1>
          <p className="text-sm text-muted-foreground">학번과 비밀번호를 입력하세요.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="studentNo">학번</Label>
            <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-3 flex items-center text-sm font-mono font-bold text-muted-foreground bg-muted/60 border-r border-input select-none">
                gwj
              </span>
              <Input
                id="studentNo"
                value={studentNo}
                onChange={(e) => {
                  // gwj 접두사 자동 제거 + (t+숫자3) 또는 (숫자4)만 허용
                  let v = e.target.value.toLowerCase().replace(/^gwj/, "");
                  if (v.startsWith("t")) {
                    v = "t" + v.slice(1).replace(/\D/g, "").slice(0, 3);
                  } else {
                    v = v.replace(/\D/g, "").slice(0, 4);
                  }
                  setStudentNo(v);
                }}
                placeholder="0001 또는 t001"
                inputMode="text"
                maxLength={4}
                autoComplete="username"
                autoFocus
                className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono tracking-widest text-base"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">학생: 숫자 4자리 / 선생님: t + 숫자 3자리</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "로그인 중…" : "로그인"}
          </Button>
        </form>
        <div className="text-sm text-center text-muted-foreground">
          계정이 없나요?{" "}
          <Link to="/signup" className="text-primary underline">
            회원가입
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default Login;
