import { describe, expect, it } from "vitest";
import { extractEntryScript, isNewerBuild } from "./appVersion";

describe("appVersion", () => {
  it("배포 HTML에서 메인 스크립트 경로를 찾는다", () => {
    const html = '<head><script type="module" crossorigin src="/assets/index-DG176CcN.js"></script></head>';
    expect(extractEntryScript(html)).toBe("/assets/index-DG176CcN.js");
  });
  it("스크립트 이름이 바뀌면 새 버전으로 본다", () => {
    expect(isNewerBuild("/assets/index-AAA.js", "/assets/index-BBB.js")).toBe(true);
    expect(isNewerBuild("/assets/index-AAA.js", "/assets/index-AAA.js")).toBe(false);
    expect(isNewerBuild("/assets/index-AAA.js", null)).toBe(false);
  });
});
