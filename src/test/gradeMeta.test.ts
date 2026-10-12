import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { GRADE_LABEL, GRADE_ORDER, gradeBadgeHtml } from "@/lib/gradeMeta";
import { fetchGradeLabels } from "@/lib/unitWorkbook";

describe("워크북 선생님 평가 배지", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(GRADE_ORDER)("등급 %s는 워크북 배지에 한국어 라벨로 표시된다", (grade) => {
    const html = gradeBadgeHtml(grade);
    expect(html).toContain(GRADE_LABEL[grade]);
  });

  it("평가 없거나 알 수 없는 등급 값은 배지를 만들지 않는다", () => {
    expect(gradeBadgeHtml(null)).toBe("");
    expect(gradeBadgeHtml(undefined)).toBe("");
    expect(gradeBadgeHtml("legacy_grade")).toBe("");
  });

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
});
