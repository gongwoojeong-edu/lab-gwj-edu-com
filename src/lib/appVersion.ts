/** 배포된 index.html 에서 메인 스크립트(/assets/index-xxxx.js) 경로를 찾아낸다. 없으면 null. */
export function extractEntryScript(html: string): string | null {
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/i)
    ?? html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/i);
  return m ? m[1] : null;
}

/** 지금 열려 있는 화면이 사용 중인 메인 스크립트 경로 */
export function currentEntryScript(doc: Document = document): string | null {
  const el = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!el) return null;
  try { return new URL(el.src).pathname; } catch { return el.getAttribute("src"); }
}

/** 두 경로가 다른 배포본인지 (경로 앞부분 차이는 무시) */
export function isNewerBuild(current: string | null, latest: string | null): boolean {
  if (!current || !latest) return false;
  const name = (p: string) => p.split("/").pop() ?? p;
  return name(current) !== name(latest);
}
