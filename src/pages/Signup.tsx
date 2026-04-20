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
    const parsed = signupSchema.safeParse({ studentNo, displayName, password });
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "입력 오류", variant: "destructive" });
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
            <Input
              id="studentNo"
              value={studentNo}
              onChange={(e) => setStudentNo(e.target.value)}
              placeholder="gwj0001"
              autoComplete="username"
              autoFocus
            />
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
