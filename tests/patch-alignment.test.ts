import { describe, expect, it } from "vitest";
import {
  analyzeFlatRegion,
  fittedInk,
  matchReferenceColors,
} from "../src/features/editor/patch-alignment";
import type { PixelRegion } from "../src/features/editor/patch-alignment";
function region(background: number, textured = false): PixelRegion {
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const index = (y * 20 + x) * 4;
      const value =
        x >= 4 && x <= 8 && y >= 6 && y <= 12
          ? 0
          : textured && x % 2 === 0
            ? background - 40
            : background;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  return { data, width: 20, height: 20 };
}
describe("conservative flat-paper matching", () => {
  it("detects original paper and the ink bounding rectangle", () => {
    expect(analyzeFlatRegion(region(255))).toEqual({
      background: [255, 255, 255],
      foreground: [0, 0, 0],
      ink: { x: 4, y: 6, width: 5, height: 7 },
    });
    expect(analyzeFlatRegion(region(215))?.background).toEqual([215, 215, 215]);
  });
  it("does not rewrite textured backgrounds and supports dark paper", () => {
    expect(analyzeFlatRegion(region(255, true))).toBeNull();
    expect(analyzeFlatRegion(region(50))?.background).toEqual([50, 50, 50]);
  });
  it("skips empty regions", () => {
    const blank = region(255);
    blank.data.fill(255);
    expect(analyzeFlatRegion(blank)).toBeNull();
  });
  it("locks the original width, height and position even if the AI changes glyph proportions", () => {
    expect(
      fittedInk(
        { x: 10, y: 20, width: 50, height: 20 },
        { x: 0, y: 0, width: 120, height: 40 },
        200,
      ),
    ).toEqual({ x: 10, y: 20, width: 50, height: 20 });
  });
  it("never shrinks a longer replacement automatically", () => {
    expect(
      fittedInk(
        { x: 10, y: 20, width: 50, height: 20 },
        { x: 0, y: 0, width: 400, height: 40 },
        100,
      ),
    ).toEqual({ x: 10, y: 20, width: 50, height: 20 });
  });
  it("rejects invalid reference geometry instead of silently moving it", () => {
    expect(() =>
      fittedInk(
        { x: 190, y: 0, width: 20, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
        200,
      ),
    ).toThrow();
  });
  it("restores exact paper and ink colors, including colored lettering", () => {
    const original = {
      background: [255, 255, 255] as [number, number, number],
      foreground: [120, 20, 40] as [number, number, number],
      ink: { x: 0, y: 0, width: 1, height: 1 },
    };
    const generated = {
      background: [210, 210, 210] as [number, number, number],
      foreground: [10, 10, 10] as [number, number, number],
      ink: original.ink,
    };
    const pixels = new Uint8ClampedArray([
      210, 210, 210, 255, 10, 10, 10, 255, 110, 110, 110, 255,
    ]);
    matchReferenceColors(pixels, original, generated);
    expect([...pixels]).toEqual([
      255, 255, 255, 255, 120, 20, 40, 255, 188, 138, 148, 255,
    ]);
  });
  it("leaves a colorless generated image alone instead of dividing by zero", () => {
    const uniform = {
      background: [255, 255, 255] as [number, number, number],
      foreground: [255, 255, 255] as [number, number, number],
      ink: { x: 0, y: 0, width: 1, height: 1 },
    };
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    matchReferenceColors(pixels, uniform, uniform);
    expect([...pixels]).toEqual([255, 255, 255, 255]);
  });
});
