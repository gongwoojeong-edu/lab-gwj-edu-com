// ============================================================
// printLauncher — 화면전환 없는 즉시 인쇄 (숨김 iframe 기반)
//
// 사용 예:
//   await launchPrint(`/teacher/handout/${sid}?student=${uid}&autoprint=1&embed=1`);
//
// 동작:
//   1. 현재 페이지에 화면 밖 <iframe>을 만들고 인쇄 전용 URL을 로드
//   2. iframe load 후 부모(런처)가 직접 print() 호출 → OS 인쇄창 즉시 표시
//   3. afterprint 또는 타임아웃 후 iframe 자동 정리
//
// 주의:
//   - iframe 을 width:0/height:0/display:none 로 두면 일부 브라우저(Chrome 등)는
//     rAF / print() 를 throttling/무시함. 따라서 화면 밖(off-screen) 위치에
//     실제 크기를 가진 iframe 을 둠.
//   - 동시에 여러 print() 호출 시 충돌 → Promise queue 로 1건씩 직렬 실행
//   - 같은 jobKey 가 이미 진행 중이면 무시 (중복 클릭 방지)
// ============================================================

let queue: Promise<void> = Promise.resolve();
const inflight = new Set<string>();

interface LaunchOptions {
  /** 중복 클릭 방지 키 (같은 키가 이미 큐/실행 중이면 무시) */
  jobKey?: string;
  /** iframe 로드 후 print() 호출까지 최대 대기 시간 (ms). */
  loadTimeoutMs?: number;
  /** print 후 iframe 정리까지 대기 시간 (ms). afterprint 가 더 빨리 오면 그때 정리 */
  cleanupAfterMs?: number;
  /** iframe 내부 데이터 로딩 대기 (ms). load 이벤트 이후 추가 대기 */
  printDelayMs?: number;
}

/**
 * 숨김 iframe 으로 인쇄 URL 을 로드하고 OS 인쇄창을 즉시 띄움.
 * 화면 이동/새 탭 없음. 항상 직렬 큐로 실행.
 */
export const launchPrint = (url: string, opts: LaunchOptions = {}): Promise<void> => {
  const { jobKey, loadTimeoutMs = 15000, cleanupAfterMs = 2000, printDelayMs = 100 } = opts;
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
        // 화면 밖(off-screen) 위치에 실제 크기로 배치 — display:none/0x0 은 일부 브라우저에서
        // rAF / print() 를 막거나 throttling 함. A4 비슷한 크기를 줘야 안전.
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

        let printed = false;
        let cleanupTimer: number | null = null;
        let printTimer: number | null = null;
        let safetyTimer: number | null = null;

        const triggerCleanup = () => {
          if (cleanupTimer != null) {
            window.clearTimeout(cleanupTimer);
            cleanupTimer = null;
          }
          if (printTimer != null) {
            window.clearTimeout(printTimer);
            printTimer = null;
          }
          if (safetyTimer != null) {
            window.clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          cleanup(frame);
        };

        const onAfterPrint = () => {
          window.removeEventListener("afterprint", onAfterPrint);
          // afterprint 직후 약간의 여유를 두고 정리 (Safari/일부 환경 안정성)
          window.setTimeout(triggerCleanup, 200);
        };
        window.addEventListener("afterprint", onAfterPrint);

        const doPrint = () => {
          if (printed) return;
          try {
            const cw = frame.contentWindow;
            if (!cw) {
              console.warn("[printLauncher] no contentWindow");
              triggerCleanup();
              return;
            }
            cw.focus();
            cw.print();
            printed = true;
            // print() 호출 후 cleanupAfterMs 안에 afterprint 가 안 오면 강제 정리
            cleanupTimer = window.setTimeout(triggerCleanup, cleanupAfterMs);
          } catch (e) {
            console.warn("[printLauncher] print() failed", e);
            triggerCleanup();
          }
        };

        // iframe 내부 React 앱이 렌더 + 데이터 fetch 를 끝내면
        // window.__LOVABLE_PRINT_READY = true 로 신호를 보냄.
        // 이 신호가 올 때까지 폴링하다가, 신호가 오면 print() 호출.
        // 폴링 타임아웃(loadTimeoutMs) 내에 신호가 없으면 강제 인쇄.
        const waitReadyAndPrint = () => {
          const start = performance.now();
          const tick = () => {
            if (printed) return;
            const cw = frame.contentWindow;
            const ready =
              !!cw && (cw as unknown as { __LOVABLE_PRINT_READY?: boolean }).__LOVABLE_PRINT_READY === true;
            if (ready) {
              // 레이아웃이 안정화될 시간을 한 박자 더 줌
              window.setTimeout(doPrint, 80);
              return;
            }
            if (performance.now() - start > loadTimeoutMs) {
              console.warn("[printLauncher] ready timeout — forcing print");
              doPrint();
              return;
            }
            window.setTimeout(tick, 80);
          };
          tick();
        };

        frame.onload = () => {
          // 최소한의 데이터 로딩 시간 후 ready 신호를 기다림
          printTimer = window.setTimeout(waitReadyAndPrint, printDelayMs);
        };

        // 절대 안전망: loadTimeoutMs 가 지나도 print 시도가 없으면 정리
        safetyTimer = window.setTimeout(() => {
          if (!printed) {
            console.warn("[printLauncher] load timeout — forcing print");
            doPrint();
          }
        }, loadTimeoutMs);

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
