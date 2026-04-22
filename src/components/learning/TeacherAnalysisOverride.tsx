import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  /** PIN 일치 시 호출. 호출 측에서 분석 통과/스킵 처리. */
  onApproved: () => void;
  disabled?: boolean;
  /** 버튼 라벨 */
  label?: string;
  /** 다이얼로그 설명 */
  description?: string;
  /** 버튼 variant */
  variant?: "ghost" | "outline" | "default";
  /** 추가 className */
  className?: string;
}

/**
 * 분석 결과에 의문점이 있을 때 선생님이 4-6자리 PIN을 입력해
 * 즉시 통과 처리할 수 있는 안전망 버튼.
 * PIN은 student_profiles.teacher_pin에 저장됨.
 */
export const TeacherAnalysisOverride = ({
  onApproved,
  disabled,
  label = "선생님 확인 후 통과",
  description = "분석 결과에 의문점이 있을 때 선생님 확인 후 통과 처리합니다.",
  variant = "ghost",
  className,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("student_profiles")
        .select("teacher_pin")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!mounted) return;
      setStoredPin((data?.teacher_pin as string | null) ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = () => {
    if (loading) return;
    setLoading(true);
    if (!storedPin) {
      toast({
        title: "PIN이 설정되지 않았어요",
        description: "선생님께 패스키 설정을 요청하세요.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (pin.trim() === storedPin.trim()) {
      toast({ title: "선생님 확인 — 통과 처리", description: "다음 단계로 진행합니다" });
      setOpen(false);
      setPin("");
      setLoading(false);
      onApproved();
    } else {
      toast({ title: "PIN이 일치하지 않습니다", variant: "destructive" });
      setPin("");
      setLoading(false);
    }
  };

  const noPin = storedPin === null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={className ?? "text-[11px] text-muted-foreground hover:text-foreground"}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={label}
      >
        <Lock className="w-3 h-3 mr-1" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>선생님 패스키</DialogTitle>
            <DialogDescription>
              {noPin
                ? "이 계정에 PIN이 설정되어 있지 않습니다. 선생님께 패스키 설정을 요청하세요."
                : description}
            </DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            disabled={noPin}
            className="text-center text-2xl tracking-[0.5em] font-mono"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={noPin || pin.length < 4 || loading}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
