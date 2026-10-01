import type { Patch } from "./pdf-browser";
import type { Point, Rect } from "./geometry";

export function translatedPatchRect(
  original: Rect,
  start: Point,
  end: Point,
): Rect {
  return {
    ...original,
    x: Math.max(0, Math.min(1 - original.width, original.x + end.x - start.x)),
    y: Math.max(0, Math.min(1 - original.height, original.y + end.y - start.y)),
  };
}
export function replacePatch(patches: Patch[], replacement: Patch): Patch[] {
  const exists = patches.some((patch) => patch.id === replacement.id);
  return exists
    ? patches.map((patch) =>
        patch.id === replacement.id ? replacement : patch,
      )
    : [...patches, replacement];
}
export function movePatch(patches: Patch[], id: string, rect: Rect): Patch[] {
  return patches.map((patch) => {
    if (patch.id !== id) return patch;
    if (!patch.background)
      throw new Error("Prepara el fondo original antes de mover este parche.");
    return {
      ...patch,
      rect: { ...rect, width: patch.rect.width, height: patch.rect.height },
      sourceRect: patch.sourceRect ?? patch.rect,
    };
  });
}
