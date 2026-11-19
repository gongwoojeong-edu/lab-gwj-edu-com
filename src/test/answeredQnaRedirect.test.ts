import { describe, expect, it } from "vitest";
import { shouldSkipPassedQnaSentence } from "@/lib/answeredQnaRedirect";

describe("shouldSkipPassedQnaSentence", () => {
  it("passed sentence with answered questions moves on", () => {
    expect(shouldSkipPassedQnaSentence({ status: "pass", redoRequestedAt: null, restart: false })).toBe(true);
  });
  it("redo button (restart) stays on the redo sentence", () => {
    expect(shouldSkipPassedQnaSentence({ status: "pass", redoRequestedAt: null, restart: true })).toBe(false);
  });
  it("open redo request stays on the sentence", () => {
    expect(shouldSkipPassedQnaSentence({ status: "pass", redoRequestedAt: "2026-09-10T07:51:50Z", restart: false })).toBe(false);
  });
  it("unfinished sentence never skips", () => {
    expect(shouldSkipPassedQnaSentence({ status: "pending", redoRequestedAt: null, restart: false })).toBe(false);
  });
});
