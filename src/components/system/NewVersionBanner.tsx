import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentEntryScript, extractEntryScript, isNewerBuild } from "@/lib/appVersion";

const CHECK_MS = 5 * 60 * 1000;

/** 화면을 오래 열어두면 예전 버전이 계속 돌아가 삭제·목록이 어긋난다 → 새 버전이 올라오면 새로고침을 권한다. */
export function NewVersionBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const current = currentEntryScript();
    if (!current) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const latest = extractEntryScript(await res.text());
        if (alive && isNewerBuild(current, latest)) setStale(true);
      } catch { /* 네트워크 오류는 다음 확인 때 다시 시도 */ }
    };
    const timer = window.setInterval(check, CHECK_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    void check();
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  if (!stale) return null;
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 flex items-center gap-3 rounded-lg border border-primary/40 bg-background px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">새 버전이 나왔어요. 새로고침하면 최신 화면으로 바뀝니다.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="size-4 mr-1" /> 새로고침
      </Button>
    </div>
  );
}
