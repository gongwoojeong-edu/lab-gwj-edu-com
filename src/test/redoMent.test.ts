import { describe, expect, it } from "vitest";
import {
  REDO_MENT_FIRST,
  REDO_MENT_SECOND,
  REDO_MENT_SUCCESS,
  pickRedoMent,
  isAutoRedoMent,
} from "@/lib/praisePhrases";

describe("재학습 승인 회차 멘트", () => {
  it("재학습을 처음 지정하면 '다시'", () => {
    expect(pickRedoMent(0, false)).toBe("다시");
    expect(REDO_MENT_FIRST).toBe("다시");
  });

  it("두 번째 이후 재학습 지정은 '견뎌'", () => {
    expect(pickRedoMent(1, false)).toBe("견뎌");
    expect(pickRedoMent(2, false)).toBe("견뎌");
    expect(REDO_MENT_SECOND).toBe("견뎌");
  });

  it("재학습 이력이 있는 문장을 통과시키면 '옳지'", () => {
    expect(pickRedoMent(1, true)).toBe("옳지");
    expect(pickRedoMent(3, true)).toBe("옳지");
    expect(REDO_MENT_SUCCESS).toBe("옳지");
  });

  it("재학습 이력 없이 통과시키면 자동 멘트 없음", () => {
    expect(pickRedoMent(0, true)).toBeNull();
  });

  it("선생님이 직접 입력한 칭찬은 자동 멘트로 덮지 않는다", () => {
    expect(isAutoRedoMent("")).toBe(true);
    expect(isAutoRedoMent("   ")).toBe(true);
    expect(isAutoRedoMent("견뎌")).toBe(true);
    expect(isAutoRedoMent("오늘 집중력 최고!")).toBe(false);
  });
});
