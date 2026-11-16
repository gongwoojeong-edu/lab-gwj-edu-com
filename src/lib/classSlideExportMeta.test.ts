import { describe, expect, it } from "vitest";
import { classCaptureFilename, classPdfFilename, pdfPageSize } from "./classSlideExportMeta";

describe("수업 화면 PDF 페이지 크기", () => {
  it("짧은 문장은 A4 가로(297×210mm) 페이지", () => {
    expect(pdfPageSize(2560, 1000)).toEqual([297, 210]);
  });
  it("학생 해석이 많아 긴 화면은 잘리지 않고 페이지가 길어진다", () => {
    expect(pdfPageSize(2560, 5120)).toEqual([297, 594]);
  });
});

describe("내보내기 파일 이름", () => {
  it("날짜가 들어간다", () => {
    const d = new Date(2026, 10, 16);
    expect(classPdfFilename(d)).toBe("수업자료_2026-11-16.pdf");
    expect(classCaptureFilename(3, d)).toBe("수업_3번_2026-11-16.png");
  });
});
