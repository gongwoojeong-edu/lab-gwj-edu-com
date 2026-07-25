/**
 * Storage 서명 URL 열기.
 * HTML은 Content-Type이 text/plain 등으로 오면 브라우저가 소스를 그대로 보여
 * ArrayBuffer → Blob(text/html;charset=utf-8)로 다시 연다.
 */
export async function openSignedStorageFile(
  signedUrl: string,
  storagePath: string,
  opts?: { fileName?: string | null },
): Promise<void> {
  const nameHint = `${storagePath}\n${opts?.fileName ?? ""}`;
  const pathLooksHtml = /\.html?(\?|#|$)/i.test(storagePath);
  const nameLooksHtml = /\.html?$/i.test(opts?.fileName ?? "");

  const openHtmlBlob = (buf: ArrayBuffer) => {
    const text = new TextDecoder("utf-8").decode(buf);
    const blob = new Blob([text], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    if (!win) {
      window.location.href = blobUrl;
    }
  };

  const looksLikeHtmlDoc = (head: string) =>
    /^<!DOCTYPE\s+html/i.test(head) || /^<html[\s>]/i.test(head);

  try {
    if (pathLooksHtml || nameLooksHtml) {
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      openHtmlBlob(await res.arrayBuffer());
      return;
    }

    // PDF 확장자여도 클로드 HTML 내보내기가 올라간 경우 — 작은 prefix만 sniff
    if (/\.(pdf|txt)$/i.test(nameHint) || !/\.\w{2,5}(\?|#|$)/i.test(storagePath)) {
      const res = await fetch(signedUrl, { headers: { Range: "bytes=0-511" } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const head = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "").trimStart();
        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        if (
          looksLikeHtmlDoc(head) ||
          (ct.includes("text/plain") && looksLikeHtmlDoc(head)) ||
          ct.includes("text/html")
        ) {
          // Range면 본문이 잘릴 수 있어 전체 재요청
          const full = await fetch(signedUrl);
          if (!full.ok) throw new Error(`HTTP ${full.status}`);
          openHtmlBlob(await full.arrayBuffer());
          return;
        }
      }
    }

    window.open(signedUrl, "_blank", "noopener,noreferrer");
  } catch {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }
}
