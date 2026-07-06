import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { uploadMemRecording } from "@/lib/memorizationRecordings";
import type { MemDirection } from "@/lib/memorizationText";

interface Props {
  sentenceId: string;
  english: string;
  korean: string;
  direction: MemDirection;
  onPassed: () => void;
}

const MAX_SEC = 30;

export const MemRecordStep = ({
  sentenceId,
  english,
  korean,
  direction,
  onPassed,
}: Props) => {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      mediaRef.current?.stop();
    };
  }, []);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = rec;
      startRef.current = Date.now();
      rec.start();
      setRecording(true);
      setTimeout(() => {
        if (mediaRef.current?.state === "recording") stopRec();
      }, MAX_SEC * 1000);
    } catch (e) {
      toast({ title: "마이크 접근 실패", description: String(e), variant: "destructive" });
    }
  };

  const stopRec = async () => {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.stop();
    setRecording(false);
    setUploading(true);
    try {
      await new Promise((r) => setTimeout(r, 200));
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const durationMs = Date.now() - startRef.current;
      await uploadMemRecording(sentenceId, blob, direction, durationMs);
      setDone(true);
      toast({ title: "녹음 제출 완료" });
      setTimeout(onPassed, 500);
    } catch (e) {
      toast({ title: "업로드 실패", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const prompt =
    direction === "ko_to_en"
      ? "한글 뜻을 보고 영어 문장을 녹음하세요."
      : "영문을 보고 한국어로 녹음하세요.";

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold">F. 녹음 제출</h3>
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </div>
      <p className="text-sm bg-muted/50 rounded-lg p-3">
        {direction === "ko_to_en" ? korean : english}
      </p>
      <div className="flex flex-col items-center gap-3">
        {!recording && !uploading && !done && (
          <Button size="lg" onClick={() => void startRec()}>
            <Mic className="w-4 h-4 mr-2" /> 녹음 시작
          </Button>
        )}
        {recording && (
          <Button size="lg" variant="destructive" onClick={() => void stopRec()}>
            <Square className="w-4 h-4 mr-2" /> 녹음 종료
          </Button>
        )}
        {uploading && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 업로드 중…
          </span>
        )}
        {done && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-bold">
            <Check className="w-4 h-4" /> 제출 완료
          </span>
        )}
        <p className="text-[11px] text-muted-foreground">최대 {MAX_SEC}초</p>
      </div>
    </Card>
  );
};
