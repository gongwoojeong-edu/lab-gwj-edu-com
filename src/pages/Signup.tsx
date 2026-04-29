import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { signupSchema, studentNoToEmail } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const Signup = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [studentNo, setStudentNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = studentNo.trim().toLowerCase();
    const normalized = raw.startsWith("gwj") ? raw : `gwj${raw}`;
    const parsed = signupSchema.safeParse({ studentNo: normalized, displayName, password });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0]?.message ?? "입력 오류", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const email = studentNoToEmail(parsed.data.studentNo);
    const { error } = await supabase.auth.signUp({
      email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          student_no: parsed.data.studentNo,
          display_name: parsed.data.displayName,
        },
      },
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "회원가입 실패",
        description: error.message.includes("already")
          ? "이미 등록된 학번입니다."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "가입 완료", description: "이제 로그인할 수 있습니다." });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">회원가입</h1>
          <p className="text-sm text-muted-foreground">학번 형식: gwj + 숫자 4자리</p>
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
            <Label htmlFor="displayName">이름</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호 (8자 이상)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "가입 중…" : "가입하기"}
          </Button>
        </form>
        <div className="text-sm text-center text-muted-foreground">
          이미 계정이 있나요?{" "}
          <Link to="/login" className="text-primary underline">
            로그인
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default Signup;
