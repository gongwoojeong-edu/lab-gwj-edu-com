import { describe, it, expect } from "vitest";
import { isCoreAnalysisSpot } from "@/lib/analysisCore";

describe("핵심 분석 지점(음영) 규칙", () => {
  it("동사는 음영", () => expect(isCoreAnalysisSpot({ pos: "동사" })).toBe(true));
  it("준동사는 음영", () => {
    expect(isCoreAnalysisSpot({ pos: "명사", form: "to V" })).toBe(true);
    expect(isCoreAnalysisSpot({ pos: "형용사", form: "V-ing/PP" })).toBe(true);
  });
  it("접속사 절·접속은 음영", () => {
    expect(isCoreAnalysisSpot({ pos: "명사", form: "접SV" })).toBe(true);
    expect(isCoreAnalysisSpot({ pos: "기타", kind: "접속" })).toBe(true);
  });
  it("특수구문은 음영", () => expect(isCoreAnalysisSpot({ pos: "기타", kind: "도치/생략/동격" })).toBe(true));
  it("일반 명사·전치사구·부사는 음영 안 함", () => {
    expect(isCoreAnalysisSpot({ pos: "명사", form: "명사" })).toBe(false);
    expect(isCoreAnalysisSpot({ pos: "부사", form: "전N" })).toBe(false);
    expect(isCoreAnalysisSpot({ pos: "부사", form: "부사" })).toBe(false);
  });
});
