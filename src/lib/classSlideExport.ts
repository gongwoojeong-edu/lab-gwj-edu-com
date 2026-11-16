// 수업 화면 캡처(PNG) / PDF 내보내기 — 굿노트 등에서 판서하도록 파일로 저장
import { pdfPageSize } from "./classSlideExportMeta";

async function renderCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas-pro");
  return html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
}

const canvasToBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요"))), type, quality));

export async function slidesToPng(el: HTMLElement): Promise<Blob> {
  return canvasToBlob(await renderCanvas(el), "image/png");
}

export async function slidesToPdf(els: HTMLElement[]): Promise<Blob> {
  if (!els.length) throw new Error("내보낼 문장이 없어요");
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const el of els) {
    const canvas = await renderCanvas(el);
    const [w, h] = pdfPageSize(canvas.width, canvas.height);
    const orientation = w >= h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: [w, h], orientation, compress: true });
    else pdf.addPage([w, h], orientation);
    const imgH = (w * canvas.height) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, imgH);
  }
  return pdf!.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** 아이패드 등 터치 기기는 공유 시트(굿노트로 보내기·파일에 저장), 그 외는 다운로드 */
export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if ((e as DOMException).name === "AbortError") return; }
  }
  downloadBlob(blob, filename);
}
