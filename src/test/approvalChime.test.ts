import { describe, it, expect } from "vitest";
import {
  unitLabelFromSentenceId,
  passageCodeLabel,
  spokenUnitLabel,
} from "@/lib/approvalChime";

describe("unitLabelFromSentenceId", () => {
  it("강 코드는 N강으로 읽는다", () => {
    expect(unitLabelFromSentenceId("L05-3-2")).toBe("5강");
    expect(unitLabelFromSentenceId("L01-001")).toBe("1강");
  });
});

describe("passageCodeLabel", () => {
  it("모의고사 코드는 문항-문장 번호로 줄인다", () => {
    expect(passageCodeLabel("37-1-alt8-7")).toBe("37-7");
  });
  it("강 코드는 null", () => {
    expect(passageCodeLabel("L05-3-2")).toBeNull();
  });
  it("해석 불가 코드는 null", () => {
    expect(passageCodeLabel("abc-def")).toBeNull();
  });
});

describe("spokenUnitLabel", () => {
  it("모의고사는 교과서 제목과 함께 읽는다", () => {
    expect(spokenUnitLabel("37-1-alt8-7", "2026년10월")).toBe("2026년10월 37-7");
  });
  it("제목이 없으면 번호만 읽는다", () => {
    expect(spokenUnitLabel("37-1-alt8-7", null)).toBe("37-7");
  });
  it("일반 강은 기존대로 N강", () => {
    expect(spokenUnitLabel("L05-3-2", "무시됨")).toBe("5강");
  });
});
