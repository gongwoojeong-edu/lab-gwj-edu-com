import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import {
  GRADE_LABEL,
  GRADE_ORDER,
  PRINT_HIDDEN_GRADES,
  gradeBadgeHtml,
  redoRoundBadgeHtml,
} from "@/lib/gradeMeta";
import { fetchApprovalRounds, fetchGradeLabels } from "@/lib/unitWorkbook";

describe("워크북 선생님 평가 배지", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(
    GRADE_ORDER.filter((g) => !PRINT_HIDDEN_GRADES.includes(g)),
  )("워크북 배지: 등급 %s 는 한국어 라벨로 표시된다", (grade) => {
    expect(gradeBadgeHtml(grade)).toContain(GRADE_LABEL[grade]);
  });

  it("워크북 배지: 잘함은 표기하지 않는다 (매우잘함/보통 이하만)", () => {
    expect(PRINT_HIDDEN_GRADES).toEqual(["good"]);
    expect(gradeBadgeHtml("good")).toBe("");
    expect(gradeBadgeHtml("excellent")).toContain("매우잘함");
    expect(gradeBadgeHtml("fair")).toContain("보통");
  });

  it("평가 없거나 알 수 없는 등급 값은 배지를 만들지 않는다", () => {
    expect(gradeBadgeHtml(null)).toBe("");
    expect(gradeBadgeHtml(undefined)).toBe("");
    expect(gradeBadgeHtml("legacy_grade")).toBe("");
  });
});

describe("워크북 재학습 회차 배지", () => {
  it("처음 학습(attempt_no 1)과 기록 없음은 배지를 만들지 않는다", () => {
    expect(redoRoundBadgeHtml(1)).toBe("");
    expect(redoRoundBadgeHtml(null)).toBe("");
    expect(redoRoundBadgeHtml(undefined)).toBe("");
    expect(redoRoundBadgeHtml(0)).toBe("");
  });

  it("attempt_no 2 는 '재학습 1회', 4 는 '재학습 3회'", () => {
    expect(redoRoundBadgeHtml(2)).toContain("재학습 1회");
    expect(redoRoundBadgeHtml(4)).toContain("재학습 3회");
  });
});

describe("워크북 진도/회차 조회", () => {
  beforeEach(() => vi.clearAllMocks());

  it("진도 조회는 해당 학생의 last_grade가 있는 문장만 담고 미발매 등급은 버린다", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      not: vi.fn().mockResolvedValue({
        data: [
          { sentence_id: "37-11", last_grade: "fair" },
          { sentence_id: "37-12", last_grade: "legacy_grade" },
        ],
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const map = await fetchGradeLabels("student-1", ["37-11", "37-12", "37-13"]);

    expect(query.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(query.in).toHaveBeenCalledWith("sentence_id", ["37-11", "37-12", "37-13"]);
    expect(query.not).toHaveBeenCalledWith("last_grade", "is", null);
    expect([...map.keys()]).toEqual(["37-11"]);
    expect(map.get("37-11")).toBe("fair");
  });

  it("회차 조회는 문장별 가장 큰 attempt_no만 남긴다", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [
          { sentence_id: "37-11", attempt_no: 1 },
          { sentence_id: "37-11", attempt_no: 3 },
          { sentence_id: "37-12", attempt_no: 2 },
        ],
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const map = await fetchApprovalRounds("student-1", ["37-11", "37-12"]);

    expect(mocks.from).toHaveBeenCalledWith("sentence_approvals");
    expect(query.select).toHaveBeenCalledWith("sentence_id, attempt_no");
    expect(map.get("37-11")).toBe(3);
    expect(map.get("37-12")).toBe(2);
  });

  it("문장 코드가 없으면 조회하지 않고 빈 결과", async () => {
    const map = await fetchApprovalRounds("student-1", []);
    expect(map.size).toBe(0);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
