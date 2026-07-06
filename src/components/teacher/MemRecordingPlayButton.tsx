import { useState } from "react";
import { Headphones, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchLatestRecording,
  getMemRecordingSignedUrl,
} from "@/lib/memorizationRecordings";
import { toast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  sentenceId: string;
}

export const MemRecordingPlayButton = ({ userId, sentenceId }: Props) => {
  const [busy, setBusy] = useState(false);

  const play = async () => {
    setBusy(true);
    try {
      const row = await fetchLatestRecording(userId, sentenceId);
      if (!row) {
        toast({ title: "녹음 없음", description: "제출된 녹음이 없습니다." });
        return;
      }
      const url = await getMemRecordingSignedUrl(row.storage_path);
      if (!url) throw new Error("재생 URL 생성 실패");
      const audio = new Audio(url);
      await audio.play();
    } catch (e) {
      toast({ title: "재생 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0"
      title="암기 녹음 듣기"
      disabled={busy}
      onClick={() => void play()}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <Headphones className="size-3" />}
    </Button>
  );
};
