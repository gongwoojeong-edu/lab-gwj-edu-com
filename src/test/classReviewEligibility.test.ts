import { describe, expect, it } from "vitest";
import { isReviewScopeAssigned, type ReviewScope } from "@/lib/classReviewEligibility";
const base: ReviewScope = { start_series_id: null, start_volume_id: null, start_unit_id: null, track_b_enabled: false, track_b_series_id: null, track_b_volume_id: null, track_b_unit_id: null };
const target = { sentenceId: "sentence", unitId: "u2", unitNo: 2, bookId: "book", seriesId: "series" };
const units = new Map([["u3", { unit_no: 3, textbook_id: "book" }]]);
describe("수업 참여 학생 학습 지정", () => {
  it("미지정 학생과 다른 책 지정 학생을 제외한다", () => {
    expect(isReviewScopeAssigned(base, target, units)).toBe(false);
    expect(isReviewScopeAssigned({ ...base, start_volume_id: "other" }, target, units)).toBe(false);
  });
  it("해당 시리즈 지정 학생은 포함한다", () => {
    expect(isReviewScopeAssigned({ ...base, start_series_id: "series" }, target, units)).toBe(true);
  });
  it("시작 유닛 이전 문장은 제외한다", () => {
    expect(isReviewScopeAssigned({ ...base, start_unit_id: "u3" }, target, units)).toBe(false);
  });
  it("활성 서브덱 학습 지정을 포함하고 비활성은 제외한다", () => {
    expect(isReviewScopeAssigned({ ...base, track_b_enabled: true, track_b_volume_id: "book" }, target, units)).toBe(true);
    expect(isReviewScopeAssigned({ ...base, track_b_volume_id: "book" }, target, units)).toBe(false);
  });
});