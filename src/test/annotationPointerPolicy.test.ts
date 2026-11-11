import { describe, expect, it } from "vitest";
import { acceptsPointer, isPalmContact, preemptsActive } from "@/features/annotation/pointerPolicy";

describe("판서 팜 리젝션", () => {
  it("손바닥처럼 넓게 닿은 터치는 마우스·손이 켜져 있어도 그리지 않는다", () => {
    const palm = { pointerType: "touch", width: 60, height: 45 };
    expect(isPalmContact(palm)).toBe(true);
    expect(acceptsPointer(palm, { allowMouse: true, laser: false })).toBe(false);
  });

  it("손가락 끝 터치는 마우스·손이 켜져 있을 때만 그린다", () => {
    const finger = { pointerType: "touch", width: 12, height: 12 };
    expect(acceptsPointer(finger, { allowMouse: true, laser: false })).toBe(true);
    expect(acceptsPointer(finger, { allowMouse: false, laser: false })).toBe(false);
  });

  it("애플펜슬은 항상 그린다", () => {
    expect(acceptsPointer({ pointerType: "pen", width: 1, height: 1 }, { allowMouse: false, laser: false })).toBe(true);
  });

  it("손가락으로 그리는 중 펜이 닿으면 펜이 획을 넘겨받는다", () => {
    expect(preemptsActive("touch", "pen")).toBe(true);
    expect(preemptsActive("pen", "touch")).toBe(false);
    expect(preemptsActive("pen", "pen")).toBe(false);
  });
});
