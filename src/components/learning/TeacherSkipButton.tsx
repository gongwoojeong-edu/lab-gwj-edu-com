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
import { toast } from "@/hooks/use-toast";
import { fetchTeacherPin } from "@/lib/teacherPin";

interface Props {
  /** PIN 일치 시 호출. 호출 측에서 onFinish(90, { teacherSkipped: true }) 처리. */
  onApproved: () => void;
  disabled?: boolean;
  /** 버튼 라벨 (기본: "선생님 확인 후 스킵") */
  label?: string;
}

/**
 * 음성 인식이 잘 안 될 때 선생님이 옆에서 4자리 PIN을 입력해
 * 즉시 통과 처리할 수 있는 안전망 버튼.
 * PIN 은 student_profiles.teacher_pin 에 저장됨.
 */
export const TeacherSkipButton = ({ onApproved, disabled, label }: Props) => {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [storedPin, setStoredPin] = useState<string | null | undefined>(undefined);
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const nextPin = await fetchTeacherPin().catch(() => {
        setPinError(true);
        return null;
      });
      if (!mounted) return;
      setStoredPin(nextPin);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    setPinError(false);
    const pinToCheck = storedPin ?? (await fetchTeacherPin().catch(() => {
      setPinError(true);
      return null;
    }));
    setStoredPin(pinToCheck);
    if (!pinToCheck) {
      toast({
        title: "PIN이 설정되지 않았어요",
        description: "선생님께 패스키 설정을 요청하세요.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    if (pin.trim() === pinToCheck.trim()) {
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

  const checkingPin = storedPin === undefined;
  const noPin = storedPin === null && !pinError;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={label ?? "선생님 확인 후 스킵"}
      >
        <Lock className="w-3 h-3 mr-1" />
        {label ?? "선생님 확인 후 스킵"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>선생님 패스키</DialogTitle>
            <DialogDescription>
              {noPin
                ? "이 계정에 PIN이 설정되어 있지 않습니다. 선생님께 패스키 설정을 요청하세요."
                : pinError
                  ? "패스키 확인이 지연되고 있습니다. 번호를 입력한 뒤 확인을 누르세요."
                : checkingPin
                  ? "패스키 설정을 확인하고 있습니다. 번호를 입력한 뒤 확인을 누르세요."
                : "선생님께 PIN을 받아 입력하세요. 일치하면 이 단계가 통과 처리됩니다."}
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
            disabled={false}
            className="text-center text-2xl tracking-[0.5em] font-mono"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={pin.length < 4 || loading}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
