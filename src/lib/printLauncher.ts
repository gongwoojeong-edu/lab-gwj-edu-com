// ============================================================
// printLauncher — 화면전환 없는 즉시 인쇄 (숨김 iframe 기반)
//
// 사용 예:
//   await launchPrint(`/teacher/handout/${sid}?student=${uid}&autoprint=1&embed=1`);
//
// 동작:
//   1. 현재 페이지에 숨김 <iframe>을 만들고 인쇄 전용 URL을 로드
//   2. iframe 내부 문서가 print() 를 호출하면 OS 인쇄 대화상자가 즉시 뜸
//   3. afterprint 또는 타임아웃 후 iframe 자동 정리
//
// 큐:
//   - 동시에 여러 print() 호출 시 충돌 → Promise queue 로 1건씩 직렬 실행
//   - 같은 jobKey 가 이미 진행 중이면 무시 (중복 클릭 방지)
// ============================================================

let queue: Promise<void> = Promise.resolve();
const inflight = new Set<string>();

interface LaunchOptions {
  /** 중복 클릭 방지 키 (같은 키가 이미 큐/실행 중이면 무시) */
  jobKey?: string;
  /** iframe 로드 후 print() 호출까지 최대 대기 시간 (ms). 자체 autoprint 가 있으면 보통 그 전에 print 됨 */
  loadTimeoutMs?: number;
  /** print 후 iframe 정리까지 대기 시간 (ms). afterprint 이벤트가 더 빨리 오면 그때 정리 */
  cleanupAfterMs?: number;
}

/**
 * 숨김 iframe 으로 인쇄 URL 을 로드하고 OS 인쇄창을 즉시 띄움.
 * 화면 이동/새 탭 없음. 항상 직렬 큐로 실행.
 */
export const launchPrint = (url: string, opts: LaunchOptions = {}): Promise<void> => {
  const { jobKey, loadTimeoutMs = 12000, cleanupAfterMs = 1500 } = opts;
  if (jobKey && inflight.has(jobKey)) {
    return Promise.resolve();
  }
  if (jobKey) inflight.add(jobKey);

  const job = queue.then(
    () =>
      new Promise<void>((resolve) => {
        const cleanup = (frame: HTMLIFrameElement | null) => {
          if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
          if (jobKey) inflight.delete(jobKey);
          resolve();
        };

        const frame = document.createElement("iframe");
        // 화면 점유 없이 완전히 숨기되, 일부 브라우저는 display:none 인 iframe 의 print() 를 무시함
        // → 시각적으로만 숨기고 레이아웃은 살림
        frame.setAttribute(
          "style",
          [
            "position: fixed",
            "right: 0",
            "bottom: 0",
            "width: 0",
            "height: 0",
            "border: 0",
            "opacity: 0",
            "pointer-events: none",
            "z-index: -1",
          ].join("; "),
        );
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("tabindex", "-1");

        let printed = false;
        let cleanupTimer: number | null = null;
        let loadTimer: number | null = null;

        const triggerCleanup = () => {
          if (cleanupTimer != null) {
            window.clearTimeout(cleanupTimer);
            cleanupTimer = null;
          }
          if (loadTimer != null) {
            window.clearTimeout(loadTimer);
            loadTimer = null;
          }
          cleanup(frame);
        };

        const onAfterPrint = () => {
          window.removeEventListener("afterprint", onAfterPrint);
          // afterprint 직후 약간의 여유를 두고 정리 (Safari/일부 환경 안정성)
          window.setTimeout(triggerCleanup, 200);
        };
        window.addEventListener("afterprint", onAfterPrint);

        // iframe 내부에서 autoprint 처리하지 못한 경우 → 우리가 한 번 더 시도
        frame.onload = () => {
          // iframe 내 autoprint 가 데이터 로드 완료 후 직접 print() 를 호출함.
          // 일부 케이스에 대비해 onload 이후 fallback timer 로 한번 더 시도.
          loadTimer = window.setTimeout(() => {
            if (printed) return;
            try {
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
              printed = true;
            } catch (e) {
              console.warn("[printLauncher] fallback print failed", e);
            }
            // 인쇄 대화상자가 뜨든 안 뜨든 cleanupAfterMs 후 강제 정리
            cleanupTimer = window.setTimeout(triggerCleanup, cleanupAfterMs);
          }, 800);
        };

        // 절대 안전망: loadTimeoutMs 가 지나면 무조건 정리
        cleanupTimer = window.setTimeout(triggerCleanup, loadTimeoutMs);

        frame.src = url;
        document.body.appendChild(frame);
      }),
  );

  // 큐는 항상 직렬 — 다음 작업이 이전 작업 완료 후 시작
  queue = job.catch(() => undefined);
  return job;
};

/**
 * 여러 인쇄 작업을 순차 실행 (예: 구문 + 단어 동시 인쇄)
 */
export const launchPrintMany = async (
  urls: string[],
  opts: LaunchOptions = {},
): Promise<void> => {
  for (const u of urls) {
    await launchPrint(u, opts);
  }
};
