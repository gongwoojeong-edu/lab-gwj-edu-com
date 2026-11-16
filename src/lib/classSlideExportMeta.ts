// 수업 화면 캡처/PDF 내보내기 — 순수 계산(브라우저 API 없음)

/** A4 가로 폭(mm). 페이지 높이는 내용 길이에 맞춰 늘어나되 A4 가로 높이보다 작아지지 않는다. */
export const PDF_PAGE_WIDTH_MM = 297;
export const PDF_MIN_PAGE_HEIGHT_MM = 210;

export function pdfPageSize(imgWidthPx: number, imgHeightPx: number): [number, number] {
  if (!(imgWidthPx > 0) || !(imgHeightPx > 0)) return [PDF_PAGE_WIDTH_MM, PDF_MIN_PAGE_HEIGHT_MM];
  const h = (PDF_PAGE_WIDTH_MM * imgHeightPx) / imgWidthPx;
  return [PDF_PAGE_WIDTH_MM, Math.max(PDF_MIN_PAGE_HEIGHT_MM, Math.round(h * 100) / 100)];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function classPdfFilename(date = new Date()): string {
  return `수업자료_${ymd(date)}.pdf`;
}

export function classCaptureFilename(slideNo: number, date = new Date()): string {
  return `수업_${slideNo}번_${ymd(date)}.png`;
}
