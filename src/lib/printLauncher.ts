// ============================================================
// printLauncher — 화면전환 없는 즉시 인쇄
//
// 핵심 변경 (v3, 2026-04):
//   - URL 기반 iframe 로드 폐기. 대신 hidden iframe 의 contentDocument 에
//     **순수 HTML 문자열을 직접 주입(document.write)** 한다.
//   - React/Router/Auth/페이지 fetch 부팅이 전혀 없음 → 클릭 직후 인쇄창.
//   - 폰트 ready 신호 + __LOVABLE_PRINT_READY 폴링 후 부모가 print() 호출.
//   - 다건은 직렬 큐로 순차 실행, hidden iframe 1개 재사용.
//
// 호환성:
//   - launchPrint(url): 레거시 — URL 라우트 인쇄용. 가능하면 launchPrintHtml 사용.
//   - launchPrintHtml(html, opts): 신규 권장 경로
//   - prewarmPrintIframe(url) / prewarmPrintDocument(html): 백그라운드 워밍
// ============================================================

let queue: Promise<void> = Promise.resolve();
const inflight = new Set<string>();

export interface LaunchOptions {
  /** 중복 클릭 방지 키 (같은 키가 이미 큐/실행 중이면 무시) */
  jobKey?: string;
  /** ready 시그널까지 최대 대기 (ms) */
  loadTimeoutMs?: number;
  /** print 후 정리까지 대기 (ms). afterprint 가 더 빨리 오면 그때 정리 */
  cleanupAfterMs?: number;
}

// ----- 풀 -----
let poolFrame: HTMLIFrameElement | null = null;
let poolReadyToken = 0;

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
    /* ignore */
  }
};

const writeHtmlIntoFrame = (frame: HTMLIFrameElement, html: string): void => {
  // Reset to blank first to drop any pending listeners
  try {
    frame.src = "about:blank";
  } catch {
    /* ignore */
  }
  // about:blank 가 비동기로 로드되므로 doc 가져오자마자 write
  const doc = frame.contentDocument;
  if (!doc) throw new Error("contentDocument 가 없습니다");
  doc.open();
  doc.write(html);
  doc.close();
};

// ============================================================
// PREWARM
// ============================================================
/** URL 기반 prewarm (레거시 — 가급적 prewarmPrintDocument 사용) */
export const prewarmPrintIframe = (url: string): void => {
  if (typeof window === "undefined") return;
  try {
    const frame = ensurePoolFrame();
    poolReadyToken++;
    clearReadyFlag(frame);
    frame.src = url;
  } catch (e) {
    console.warn("[printLauncher] prewarm(url) failed", e);
  }
};

/** HTML 직주입 prewarm — 풀 iframe 만 살려두기 위한 noop 호출도 OK */
export const prewarmPrintDocument = (html?: string): void => {
  if (typeof window === "undefined") return;
  try {
    const frame = ensurePoolFrame();
    if (!html) return;
    poolReadyToken++;
    clearReadyFlag(frame);
    writeHtmlIntoFrame(frame, html);
  } catch (e) {
    console.warn("[printLauncher] prewarm(html) failed", e);
  }
};

// ============================================================
// CORE: HTML 직주입 인쇄
// ============================================================
export const launchPrintHtml = (
  html: string,
  opts: LaunchOptions = {},
): Promise<void> => {
  const { jobKey, loadTimeoutMs = 6000, cleanupAfterMs = 1500 } = opts;
  if (jobKey && inflight.has(jobKey)) return Promise.resolve();
  if (jobKey) inflight.add(jobKey);

  const job = queue.then(
    () =>
      new Promise<void>((resolve, reject) => {
        const frame = ensurePoolFrame();
        const myToken = ++poolReadyToken;

        let printed = false;
        let cleanupTimer: number | null = null;
        let safetyTimer: number | null = null;
        let pollTimer: number | null = null;

        const finish = (err?: unknown) => {
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
          try {
            clearReadyFlag(frame);
            // 다음 작업을 위해 비워둠
            const doc = frame.contentDocument;
            if (doc) {
              doc.open();
              doc.write("<!doctype html><html><head></head><body></body></html>");
              doc.close();
            }
          } catch {
            /* ignore */
          }
          if (err) reject(err);
          else resolve();
        };

        const onAfterPrint = () => {
          window.setTimeout(() => finish(), 150);
        };
        window.addEventListener("afterprint", onAfterPrint);

        const doPrint = () => {
          if (printed) return;
          printed = true;
          try {
            const cw = frame.contentWindow;
            if (!cw) {
              finish(new Error("인쇄 창 호출 실패 (contentWindow 없음)"));
              return;
            }
            cw.focus();
            cw.print();
            cleanupTimer = window.setTimeout(() => finish(), cleanupAfterMs);
          } catch (e) {
            finish(e instanceof Error ? e : new Error("인쇄 호출 실패"));
          }
        };

        const startedAt = performance.now();
        const poll = () => {
          if (printed) return;
          if (myToken !== poolReadyToken) {
            // 다른 작업이 풀을 가져갔음 — 그냥 종료
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
            /* ignore */
          }
          if (ready) {
            // 폰트 ready (가능한 경우)
            try {
              const doc = frame.contentDocument as
                | (Document & { fonts?: { ready?: Promise<unknown> } })
                | null;
              if (doc?.fonts?.ready) {
                doc.fonts.ready.then(() => window.setTimeout(doPrint, 30));
                return;
              }
            } catch {
              /* ignore */
            }
            window.setTimeout(doPrint, 30);
            return;
          }
          if (performance.now() - startedAt > loadTimeoutMs) {
            console.warn("[printLauncher] ready timeout — forcing print");
            doPrint();
            return;
          }
          pollTimer = window.setTimeout(poll, 30);
        };

        try {
          clearReadyFlag(frame);
          writeHtmlIntoFrame(frame, html);
        } catch (e) {
          finish(e instanceof Error ? e : new Error("문서 주입 실패"));
          return;
        }

        safetyTimer = window.setTimeout(() => {
          if (!printed) {
            console.warn("[printLauncher] absolute timeout — forcing print");
            doPrint();
          }
        }, loadTimeoutMs + 1000);

        // document.write 직후엔 이미 준비됐을 가능성 매우 높음 → 즉시 폴링
        window.setTimeout(poll, 0);
      }),
  );

  queue = job.catch(() => undefined);
  return job;
};

// ============================================================
// LEGACY: URL 기반 인쇄 (PDF 미리보기 등 호환용)
// ============================================================
export const launchPrint = (url: string, opts: LaunchOptions = {}): Promise<void> => {
  const { jobKey, loadTimeoutMs = 12000, cleanupAfterMs = 2000 } = opts;
  if (jobKey && inflight.has(jobKey)) return Promise.resolve();
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
          if (cleanupTimer != null) window.clearTimeout(cleanupTimer);
          if (safetyTimer != null) window.clearTimeout(safetyTimer);
          if (pollTimer != null) window.clearTimeout(pollTimer);
          window.removeEventListener("afterprint", onAfterPrint);
          if (jobKey) inflight.delete(jobKey);
          try {
            clearReadyFlag(frame);
            frame.src = "about:blank";
          } catch {
            /* ignore */
          }
          resolve();
        };

        const onAfterPrint = () => window.setTimeout(finish, 200);
        window.addEventListener("afterprint", onAfterPrint);

        const doPrint = () => {
          if (printed) return;
          printed = true;
          try {
            const cw = frame.contentWindow;
            if (!cw) return finish();
            cw.focus();
            cw.print();
            cleanupTimer = window.setTimeout(finish, cleanupAfterMs);
          } catch (e) {
            console.warn("[printLauncher] legacy print() failed", e);
            finish();
          }
        };

        const startedAt = performance.now();
        const poll = () => {
          if (printed) return;
          if (myToken !== poolReadyToken) return finish();
          let ready = false;
          try {
            const cw = frame.contentWindow as unknown as
              | { __LOVABLE_PRINT_READY?: boolean }
              | null;
            ready = !!cw && cw.__LOVABLE_PRINT_READY === true;
          } catch {
            /* ignore */
          }
          if (ready) return window.setTimeout(doPrint, 60);
          if (performance.now() - startedAt > loadTimeoutMs) return doPrint();
          pollTimer = window.setTimeout(poll, 60);
        };

        try {
          clearReadyFlag(frame);
          frame.src = url;
        } catch (e) {
          console.warn("[printLauncher] legacy src failed", e);
          return finish();
        }
        safetyTimer = window.setTimeout(() => {
          if (!printed) doPrint();
        }, loadTimeoutMs + 1000);

        const onLoad = () => {
          frame.removeEventListener("load", onLoad);
          window.setTimeout(poll, 30);
        };
        frame.addEventListener("load", onLoad);
        window.setTimeout(poll, 50);
      }),
  );

  queue = job.catch(() => undefined);
  return job;
};

/** 여러 인쇄 작업을 순차 실행 (HTML 직주입) */
export const launchPrintHtmlMany = async (
  htmls: string[],
  opts: LaunchOptions = {},
): Promise<void> => {
  for (let i = 0; i < htmls.length; i++) {
    const k = opts.jobKey ? `${opts.jobKey}:${i}` : undefined;
    await launchPrintHtml(htmls[i], { ...opts, jobKey: k });
  }
};

/** 여러 URL 인쇄 작업을 순차 실행 (레거시) */
export const launchPrintMany = async (
  urls: string[],
  opts: LaunchOptions = {},
): Promise<void> => {
  for (let i = 0; i < urls.length; i++) {
    const k = opts.jobKey ? `${opts.jobKey}:${i}` : undefined;
    await launchPrint(urls[i], { ...opts, jobKey: k });
  }
};
