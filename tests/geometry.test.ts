import { describe, expect, it } from "vitest";
import {
  cropPixels,
  normalizedRect,
  resizePlan,
  selectionRect,
  validateSelection,
} from "../src/features/editor/geometry";
describe("selection and crop privacy", () => {
  it("normalizes backwards selection and clamps at the page edge", () => {
    expect(selectionRect({ x: 0.9, y: 1.3 }, { x: -0.1, y: 0.6 })).toEqual({
      x: 0,
      y: 0.6,
      width: 0.9,
      height: 0.4,
    });
  });
  it("rounds inward so no outside pixels are sent", () => {
    const rect = { x: 0.1234, y: 0.2367, width: 0.2, height: 0.1 };
    const pixels = cropPixels(rect, 1000, 1000);
    expect(pixels).toEqual({ x: 124, y: 237, width: 199, height: 99 });
    expect(pixels.x).toBeGreaterThanOrEqual(rect.x * 1000);
    expect(pixels.x + pixels.width).toBeLessThanOrEqual(
      (rect.x + rect.width) * 1000,
    );
    expect(normalizedRect(pixels, 1000, 1000)).toEqual({
      x: 0.124,
      y: 0.237,
      width: 0.199,
      height: 0.099,
    });
  });
  it.each([
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0.9, height: 0.4 },
  ])("rejects whole pages and overlarge regions", (rect) => {
    expect(() => validateSelection(rect, 1000, 1000)).toThrow("30 %");
  });
  it.each([
    { x: -1, y: 0, width: 0.1, height: 0.1 },
    { x: 0.9, y: 0, width: 0.2, height: 0.1 },
    { x: 0, y: 0, width: NaN, height: 0.1 },
    { x: 0, y: 0, width: 0, height: 0.1 },
  ])("rejects invalid geometry", (rect) =>
    expect(() => validateSelection(rect, 1000, 1000)).toThrow(),
  );
  it("rejects tiny selection and zero page dimensions", () => {
    expect(() =>
      validateSelection({ x: 0, y: 0, width: 0.001, height: 0.1 }, 1000, 1000),
    ).toThrow("pequeño");
    expect(() =>
      validateSelection({ x: 0, y: 0, width: 0.1, height: 0.1 }, 0, 1000),
    ).toThrow();
  });
  it("upscales text, uses only blank padding for thin lines and caps at 2048", () => {
    const plan = resizePlan(200, 20, 3);
    expect(plan.width).toBe(1024);
    expect(plan.height).toBe(256);
    expect(plan.content.width).toBe(1024);
    expect(plan.content.height).toBe(102);
    expect(plan.content.y).toBe(77);
    const huge = resizePlan(4000, 2000, 4);
    expect(huge.width).toBe(2048);
    expect(huge.height).toBe(1024);
    const tall = resizePlan(20, 200, 3);
    expect(tall.width).toBe(256);
    expect(tall.height).toBe(1024);
    expect(tall.content.x).toBe(77);
  });
});
