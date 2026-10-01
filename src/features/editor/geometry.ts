export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export const MAX_SELECTION_AREA = 0.3;
export function selectionRect(start: Point, end: Point): Rect {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const x = Math.min(clamp(start.x), clamp(end.x));
  const y = Math.min(clamp(start.y), clamp(end.y));
  return {
    x,
    y,
    width: Math.abs(clamp(end.x) - clamp(start.x)),
    height: Math.abs(clamp(end.y) - clamp(start.y)),
  };
}
export function validateSelection(rect: Rect, width: number, height: number) {
  if (
    ![rect.x, rect.y, rect.width, rect.height, width, height].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height <= 0 ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > 1.000001 ||
    rect.y + rect.height > 1.000001
  )
    throw new Error("Selecciona una región dentro de la página.");
  if (rect.width * width < 6 || rect.height * height < 6)
    throw new Error(
      "El recorte es demasiado pequeño. Selecciona al menos 6 × 6 píxeles.",
    );
  if (rect.width * rect.height > MAX_SELECTION_AREA)
    throw new Error(
      "Por privacidad, selecciona menos del 30 % de la página. Nunca se envía una página completa.",
    );
}
export function cropPixels(rect: Rect, width: number, height: number): Rect {
  validateSelection(rect, width, height);
  // Round inward: never include document pixels outside the selected region.
  const x = Math.ceil(rect.x * width),
    y = Math.ceil(rect.y * height);
  return {
    x,
    y,
    width: Math.floor((rect.x + rect.width) * width) - x,
    height: Math.floor((rect.y + rect.height) * height) - y,
  };
}
export function resizePlan(width: number, height: number, multiplier: number) {
  const factor = Math.min(
    Math.max(multiplier, 1024 / Math.max(width, height)),
    2048 / Math.max(width, height),
  );
  const contentWidth = Math.max(1, Math.round(width * factor));
  const contentHeight = Math.max(1, Math.round(height * factor));
  // Blank padding improves text editing on narrow lines without exposing neighboring data.
  const canvasWidth = Math.max(contentWidth, Math.ceil(contentHeight / 4));
  const canvasHeight = Math.max(contentHeight, Math.ceil(contentWidth / 4));
  return {
    width: canvasWidth,
    height: canvasHeight,
    content: {
      x: Math.floor((canvasWidth - contentWidth) / 2),
      y: Math.floor((canvasHeight - contentHeight) / 2),
      width: contentWidth,
      height: contentHeight,
    },
  };
}
export function normalizedRect(
  rect: Rect,
  width: number,
  height: number,
): Rect {
  return {
    x: rect.x / width,
    y: rect.y / height,
    width: rect.width / width,
    height: rect.height / height,
  };
}
