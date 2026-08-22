/**
 * 신텍스스튜디오에서 내보낸 구조도 HTML 은 DOM 스냅샷이라
 * showDetail()/closeDetail() 스크립트가 빠진 채 저장되는 경우가 있다.
 * → 노드를 눌러도 아무 반응이 없어, 열 때 최소 동작 스크립트를 주입한다.
 */
const FALLBACK_DETAIL_SCRIPT = `
<script>(function(){
  if (typeof window.showDetail === "function") return;
  var nodes = Array.prototype.slice.call(document.querySelectorAll(".node-g"));
  var wrap = document.getElementById("detail-wrap");
  function txt(el){ return el ? (el.textContent || "").trim() : ""; }
  window.showDetail = function(i){
    var g = nodes[i];
    if (!g || !wrap) return;
    var lines = Array.prototype.map.call(g.querySelectorAll("text"), function(t){ return txt(t); })
      .filter(function(s){ return s; });
    var badge = document.getElementById("d-badge");
    var title = document.getElementById("d-title");
    var en = document.getElementById("d-en");
    var ko = document.getElementById("d-ko");
    var pt = document.getElementById("d-pt");
    if (badge) badge.textContent = "STEP " + (i + 1);
    if (title) title.textContent = lines[0] || ("노드 " + (i + 1));
    if (en) en.textContent = lines.slice(1).join(" / ") || "-";
    if (ko && !txt(ko)) ko.textContent = "-";
    if (pt && !txt(pt)) pt.textContent = "이 파일에는 상세 원문·해설이 포함되어 있지 않습니다. 신텍스스튜디오에서 상세 포함으로 다시 내보내 주세요.";
    wrap.classList.add("visible");
    wrap.style.display = "block";
    nodes.forEach(function(n){ n.classList.remove("selected"); });
    g.classList.add("selected");
    try { wrap.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  };
  window.closeDetail = function(){
    if (!wrap) return;
    wrap.classList.remove("visible");
    wrap.style.display = "none";
  };
  nodes.forEach(function(g){ g.style.cursor = "pointer"; });
})();<\/script>
`;

function repairInteractiveHtml(html: string): string {
  const needsDetail =
    /onclick\s*=\s*["']showDetail\(/i.test(html) && !/function\s+showDetail/i.test(html);
  if (!needsDetail) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + FALLBACK_DETAIL_SCRIPT;
  return html.slice(0, idx) + FALLBACK_DETAIL_SCRIPT + html.slice(idx);
}

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
    const text = repairInteractiveHtml(new TextDecoder("utf-8").decode(buf));
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
