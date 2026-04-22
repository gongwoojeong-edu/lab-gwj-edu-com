// ============================================================
// printLauncher — 화면전환 없는 즉시 인쇄 (재사용 hidden iframe 풀)
//
// 변경점 (2026-04):
//   - 모듈 레벨에 hidden iframe 1개를 lazy 생성해 재사용 (DOM 재생성 없음)
//   - prewarmPrintIframe(url): 미리 src 로드 → DNS/JS/CSS 캐시 hit
//   - launchPrint(url): 풀 iframe 의 src 만 교체, ready 신호 받으면 부모가 print()
//   - 다건은 직렬 큐로 순차 실행
//   - autoprint/embed 모드 분리: iframe 안에서는 자체 print() 호출 안 함
// ============================================================

let queue: Promise<void> = Promise.resolve();
const inflight = new Set<string>();

interface LaunchOptions {
  /** 중복 클릭 방지 키 (같은 키가 이미 큐/실행 중이면 무시) */
  jobKey?: string;
  /** iframe 로드 후 print() 호출까지 최대 대기 시간 (ms). */
  loadTimeoutMs?: number;
  /** print 후 정리까지 대기 시간 (ms). afterprint 가 더 빨리 오면 그때 정리 */
  cleanupAfterMs?: number;
}

// ----- 풀 -----
let poolFrame: HTMLIFrameElement | null = null;
let poolReadyToken = 0; // 매 src 교체 시 증가 → 이전 폴링 무효화

const ensurePoolFrame = (): HTMLIFrameElement => {
  if (poolFrame && poolFrame.isConnected) return poolFrame;
  const frame = document.createElement("iframe");
  frame.setAttribute(
    "style",
    [
      "position: fixed",
      "left: -10000px",
      "top: 0",
      "width: 800px",
      "height: 1000px",
      "border: 0",
      "opacity: 0",
      "pointer-events: none",
      "z-index: -1",
    ].join("; "),
  );
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("title", "print-pool");
  frame.src = "about:blank";
  document.body.appendChild(frame);
  poolFrame = frame;
  return frame;
};

const clearReadyFlag = (frame: HTMLIFrameElement) => {
  try {
    const cw = frame.contentWindow as unknown as { __LOVABLE_PRINT_READY?: boolean } | null;
    if (cw) cw.__LOVABLE_PRINT_READY = false;
  } catch {
    /* cross-origin or detached — ignore */
  }
};

/**
 * 풀 iframe 에 인쇄 URL 을 미리 로드해 둠 (print() 호출 안 함).
 * 첫 인쇄 클릭 직전에 호출하면 체감 속도가 크게 개선.
 */
export const prewarmPrintIframe = (url: string): void => {
  if (typeof window === "undefined") return;
  try {
    const frame = ensurePoolFrame();
    poolReadyToken++;
    clearReadyFlag(frame);
    frame.src = url;
  } catch (e) {
    console.warn("[printLauncher] prewarm failed", e);
  }
};

/**
 * 숨김 iframe 으로 인쇄 URL 을 로드하고 OS 인쇄창을 즉시 띄움.
 * 화면 이동/새 탭 없음. 항상 직렬 큐로 실행.
 */
export const launchPrint = (url: string, opts: LaunchOptions = {}): Promise<void> => {
  const { jobKey, loadTimeoutMs = 12000, cleanupAfterMs = 2000 } = opts;
  if (jobKey && inflight.has(jobKey)) {
    return Promise.resolve();
  }
  if (jobKey) inflight.add(jobKey);

  const job = queue.then(
    () =>
      new Promise<void>((resolve) => {
        const frame = ensurePoolFrame();
        const myToken = ++poolReadyToken;

        let printed = false;
        let cleanupTimer: number | null = null;
        let safetyTimer: number | null = null;
        let pollTimer: number | null = null;

        const finish = () => {
          if (cleanupTimer != null) {
            window.clearTimeout(cleanupTimer);
            cleanupTimer = null;
          }
          if (safetyTimer != null) {
            window.clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          if (pollTimer != null) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
          }
          window.removeEventListener("afterprint", onAfterPrint);
          if (jobKey) inflight.delete(jobKey);
          // 풀 iframe 은 파기하지 않고 about:blank 로 비워 재사용
          try {
            clearReadyFlag(frame);
            frame.src = "about:blank";
          } catch {
            /* ignore */
          }
          resolve();
        };

        const onAfterPrint = () => {
          // 약간의 여유 후 정리
          window.setTimeout(finish, 200);
        };
        window.addEventListener("afterprint", onAfterPrint);

        const doPrint = () => {
          if (printed) return;
          printed = true;
          try {
            const cw = frame.contentWindow;
            if (!cw) {
              console.warn("[printLauncher] no contentWindow");
              finish();
              return;
            }
            cw.focus();
            cw.print();
            cleanupTimer = window.setTimeout(finish, cleanupAfterMs);
          } catch (e) {
            console.warn("[printLauncher] print() failed", e);
            finish();
          }
        };

        // ready 시그널 폴링
        const startedAt = performance.now();
        const poll = () => {
          if (printed) return;
          // 이 작업 토큰이 무효화됐으면 중단
          if (myToken !== poolReadyToken) {
            finish();
            return;
          }
          let ready = false;
          try {
            const cw = frame.contentWindow as unknown as
              | { __LOVABLE_PRINT_READY?: boolean }
              | null;
            ready = !!cw && cw.__LOVABLE_PRINT_READY === true;
          } catch {
            /* cross-origin shouldn't happen — same origin */
          }
          if (ready) {
            // 한 박자 더 줘서 레이아웃/폰트 안정화
            window.setTimeout(doPrint, 60);
            return;
          }
          if (performance.now() - startedAt > loadTimeoutMs) {
            console.warn("[printLauncher] ready timeout — forcing print");
            doPrint();
            return;
          }
          pollTimer = window.setTimeout(poll, 60);
        };

        // src 교체 → 폴링 시작
        try {
          clearReadyFlag(frame);
          frame.src = url;
        } catch (e) {
          console.warn("[printLauncher] src set failed", e);
          finish();
          return;
        }
        // 절대 안전망
        safetyTimer = window.setTimeout(() => {
          if (!printed) {
            console.warn("[printLauncher] absolute timeout — forcing print");
            doPrint();
          }
        }, loadTimeoutMs + 1000);

        // load 후 폴링 시작 (load 가 이미 끝났을 수도 있으니 조금 후에도 시도)
        const onLoad = () => {
          frame.removeEventListener("load", onLoad);
          window.setTimeout(poll, 30);
        };
        frame.addEventListener("load", onLoad);
        // load 가 fire 됐을 가능성 대비
        window.setTimeout(poll, 50);
      }),
  );

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
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const k = opts.jobKey ? `${opts.jobKey}:${i}` : undefined;
    await launchPrint(u, { ...opts, jobKey: k });
  }
};
