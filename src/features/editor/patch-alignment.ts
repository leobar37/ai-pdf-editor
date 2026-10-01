import type { Rect } from "./geometry";
export interface PixelRegion {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface FlatRegion {
  background: [number, number, number];
  ink: Rect;
  foreground: [number, number, number];
}
export function analyzeFlatRegion(region: PixelRegion): FlatRegion | null {
  const { data, width, height } = region;
  const edges: number[][] = [[], [], []];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x !== 0 && x !== width - 1 && y !== 0 && y !== height - 1) continue;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        edges[channel].push(data[index + channel]);
    }
  const background = edges.map(
    (samples) => samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  ) as [number, number, number];
  if (
    edges.some(
      (samples, channel) =>
        samples.filter((value) => Math.abs(value - background[channel]) > 12)
          .length >
        samples.length * 0.05,
    )
  )
    return null;
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    count = 0;
  let strongestContrast = 0;
  let foreground: [number, number, number] = [...background];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const contrast = Math.max(
        Math.abs(background[0] - data[index]),
        Math.abs(background[1] - data[index + 1]),
        Math.abs(background[2] - data[index + 2]),
      );
      if (contrast < 48) continue;
      if (contrast > strongestContrast) {
        strongestContrast = contrast;
        foreground = [data[index], data[index + 1], data[index + 2]];
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count++;
    }
  if (count < 8 || right < left || bottom < top) return null;
  return {
    background,
    foreground,
    ink: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
  };
}
export function fittedInk(
  original: Rect,
  generated: Rect,
  canvasWidth: number,
): Rect {
  if (
    original.x < 0 ||
    original.x + original.width > canvasWidth ||
    original.width <= 0 ||
    original.height <= 0 ||
    generated.width <= 0 ||
    generated.height <= 0
  )
    throw new Error(
      "No se pudieron conservar las medidas del texto de referencia.",
    );
  // Lock BOTH dimensions. Never shrink longer text or let AI choose its width.
  return { ...original };
}

export function matchReferenceColors(
  pixels: Uint8ClampedArray,
  original: FlatRegion,
  generated: FlatRegion,
) {
  const direction = generated.foreground.map(
    (value, channel) => value - generated.background[channel],
  );
  const lengthSquared = direction.reduce(
    (total, value) => total + value * value,
    0,
  );
  if (!lengthSquared) return;
  for (let index = 0; index < pixels.length; index += 4) {
    const coverage = Math.max(
      0,
      Math.min(
        1,
        direction.reduce(
          (total, value, channel) =>
            total +
            (pixels[index + channel] - generated.background[channel]) * value,
          0,
        ) / lengthSquared,
      ),
    );
    for (let channel = 0; channel < 3; channel++) {
      pixels[index + channel] =
        original.background[channel] +
        coverage *
          (original.foreground[channel] - original.background[channel]);
    }
  }
}
