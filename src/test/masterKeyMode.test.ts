import { describe, it, expect } from "vitest";
import { applyMasterKeyFlags, isMasterKeyMode } from "@/lib/masterKeyMode";

const all = { pre: true, analysis: true, translation: true, wordtest: true };

describe("마스터키 등록 모드", () => {
  it("관리자가 ?master=1로 들어오면 마스터 모드", () => {
    expect(isMasterKeyMode("?master=1", ["admin"])).toBe(true);
  });
  it("학생은 주소에 master=1이 있어도 마스터 모드가 아님", () => {
    expect(isMasterKeyMode("?master=1", ["student"])).toBe(false);
  });
  it("마스터 모드는 단어 학습·단어 테스트를 건너뛰고 분석·한글 해석만 남김", () => {
    expect(applyMasterKeyFlags(all, true)).toEqual({ pre: false, wordtest: false, analysis: true, translation: true });
  });
  it("일반 모드는 기존 단계 설정 그대로", () => {
    const f = { pre: false, analysis: true, translation: true, wordtest: true };
    expect(applyMasterKeyFlags(f, false)).toEqual(f);
  });
});
