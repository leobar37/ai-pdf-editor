import { describe, expect, it } from "vitest";
import {
  movePatch,
  replacePatch,
  translatedPatchRect,
} from "../src/features/editor/patch-state";
import type { Patch } from "../src/features/editor/pdf-browser";
const first: Patch = {
  id: "first",
  page: 1,
  rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
  image: "first-image",
  background: "clean-original",
  replacement: "Roberto",
};
const second: Patch = {
  id: "second",
  page: 2,
  rect: { x: 0.3, y: 0.4, width: 0.1, height: 0.1 },
  image: "second-image",
  background: "clean-second",
  replacement: "Andrea",
};
describe("independent patch operations", () => {
  it("adds different text patches without replacing earlier ones", () => {
    expect(replacePatch([first], second)).toEqual([first, second]);
  });
  it("regenerates the selected patch in-place, not as an extra patch", () => {
    const updated = {
      ...first,
      image: "regenerated",
      feedback: "thinner letters",
    };
    expect(replacePatch([first, second], updated)).toEqual([updated, second]);
    expect(first.image).toBe("first-image");
  });
  it("moves only the selected patch and remembers the original erased region", () => {
    const result = movePatch([first, second], first.id, {
      x: 0.5,
      y: 0.6,
      width: 0.9,
      height: 0.9,
    });
    expect(result[0].rect).toEqual({
      x: 0.5,
      y: 0.6,
      width: 0.2,
      height: 0.05,
    });
    expect(result[0].sourceRect).toEqual(first.rect);
    expect(result[1]).toBe(second);
    expect(first.rect.x).toBe(0.1);
    const again = movePatch(result, first.id, { ...result[0].rect, x: 0.7 });
    expect(again[0].sourceRect).toEqual(first.rect);
    expect(again[0].background).toBe("clean-original");
  });
  it("keeps the same dimensions at zoom-independent drag positions", () => {
    const result = translatedPatchRect(
      first.rect,
      { x: 0.15, y: 0.25 },
      { x: 0.4, y: 0.55 },
    );
    expect(result.x).toBeCloseTo(0.35);
    expect(result.y).toBeCloseTo(0.5);
    expect(result.width).toBe(first.rect.width);
    expect(result.height).toBe(first.rect.height);
  });
  it("clamps movement within the page instead of losing the patch", () => {
    expect(
      translatedPatchRect(first.rect, { x: 0, y: 0 }, { x: 10, y: 10 }),
    ).toEqual({ x: 0.8, y: 0.95, width: 0.2, height: 0.05 });
    expect(
      translatedPatchRect(first.rect, { x: 0, y: 0 }, { x: -10, y: -10 }),
    ).toEqual({ x: 0, y: 0, width: 0.2, height: 0.05 });
  });
  it("refuses to move a legacy/complex patch until its original background is prepared", () => {
    expect(() =>
      movePatch([{ ...first, background: undefined }], first.id, first.rect),
    ).toThrow("fondo original");
  });
});
