import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cropPixels, normalizedRect, resizePlan, type Rect } from "./geometry";
import {
  analyzeFlatRegion,
  fittedInk,
  matchReferenceColors,
} from "./patch-alignment";
import type { TextReference } from "./edit-contract";
GlobalWorkerOptions.workerSrc = workerUrl;
export interface Patch {
  id: string;
  page: number;
  rect: Rect;
  image: string;
  replacement: string;
  sourceRect?: Rect;
  background?: string;
  referenceCrop?: PreparedCrop;
  feedback?: string;
}
export interface PreparedCrop {
  image: string;
  preview: string;
  rect: Rect;
  width: number;
  height: number;
  content: Rect;
  reference?: TextReference;
  background?: string;
  measurements?: { widthMm: number; heightMm: number };
}
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } =
    Promise.withResolvers<HTMLImageElement>();
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () =>
    reject(new Error("No se pudo leer la imagen del parche."));
  image.src = src;
  return promise;
}
export async function renderPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  patches: Patch[],
  scale = 2,
) {
  const page = await document.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({
    scale: Math.min(scale, 3200 / Math.max(base.width, base.height)),
  });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no permite dibujar el PDF.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const pagePatches = patches.filter((p) => p.page === pageNumber);
  for (const patch of pagePatches) {
    if (!patch.background) continue;
    const origin = patch.sourceRect ?? patch.rect;
    context.drawImage(
      await loadImage(patch.background),
      origin.x * canvas.width,
      origin.y * canvas.height,
      origin.width * canvas.width,
      origin.height * canvas.height,
    );
  }
  const backgroundCanvas = window.document.createElement("canvas");
  backgroundCanvas.width = canvas.width;
  backgroundCanvas.height = canvas.height;
  backgroundCanvas.getContext("2d")!.drawImage(canvas, 0, 0);
  canvas.dataset.pageWidth = String(base.width);
  canvas.dataset.pageHeight = String(base.height);
  for (const patch of patches.filter((p) => p.page === pageNumber)) {
    const image = await loadImage(patch.image);
    context.drawImage(
      image,
      patch.rect.x * canvas.width,
      patch.rect.y * canvas.height,
      patch.rect.width * canvas.width,
      patch.rect.height * canvas.height,
    );
  }
  return { canvas, backgroundCanvas, width: base.width, height: base.height };
}
export function prepareCrop(
  source: HTMLCanvasElement,
  selection: Rect,
  multiplier: number,
): PreparedCrop {
  const pixels = cropPixels(selection, source.width, source.height);
  const plan = resizePlan(pixels.width, pixels.height, multiplier);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el recorte.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    plan.content.x,
    plan.content.y,
    plan.content.width,
    plan.content.height,
  );
  const preview = document.createElement("canvas");
  preview.width = pixels.width;
  preview.height = pixels.height;
  preview
    .getContext("2d")!
    .drawImage(
      source,
      pixels.x,
      pixels.y,
      pixels.width,
      pixels.height,
      0,
      0,
      pixels.width,
      pixels.height,
    );
  const layout = analyzeFlatRegion(
    ctx.getImageData(
      plan.content.x,
      plan.content.y,
      plan.content.width,
      plan.content.height,
    ),
  );
  const reference = layout
    ? {
        bounds: {
          ...layout.ink,
          x: layout.ink.x + plan.content.x,
          y: layout.ink.y + plan.content.y,
        },
        foreground: layout.foreground,
        background: layout.background,
      }
    : undefined;
  let background: string | undefined;
  if (layout) {
    const clean = document.createElement("canvas");
    clean.width = plan.content.width;
    clean.height = plan.content.height;
    const cleanContext = clean.getContext("2d")!;
    cleanContext.fillStyle = `rgb(${layout.background.join(",")})`;
    cleanContext.fillRect(0, 0, clean.width, clean.height);
    background = clean.toDataURL("image/png");
  }
  const pageWidth = Number(source.dataset.pageWidth),
    pageHeight = Number(source.dataset.pageHeight);
  const measurements =
    reference && pageWidth && pageHeight
      ? {
          widthMm:
            ((((reference.bounds.width / plan.content.width) * pixels.width) /
              source.width) *
              pageWidth *
              25.4) /
            72,
          heightMm:
            ((((reference.bounds.height / plan.content.height) *
              pixels.height) /
              source.height) *
              pageHeight *
              25.4) /
            72,
        }
      : undefined;
  return {
    image: canvas.toDataURL("image/png"),
    preview: preview.toDataURL("image/png"),
    rect: normalizedRect(pixels, source.width, source.height),
    reference,
    background,
    measurements,
    ...plan,
  };
}
export async function extractPatch(
  imageData: string,
  crop: PreparedCrop,
  purpose: "replace" | "erase" = "replace",
) {
  const image = await loadImage(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = crop.content.width;
  canvas.height = crop.content.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el parche.");
  const sx = image.naturalWidth / crop.width,
    sy = image.naturalHeight / crop.height;
  ctx.drawImage(
    image,
    crop.content.x * sx,
    crop.content.y * sy,
    crop.content.width * sx,
    crop.content.height * sy,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (purpose === "erase") return canvas.toDataURL("image/png");
  const reference = document.createElement("canvas");
  reference.width = canvas.width;
  reference.height = canvas.height;
  const referenceContext = reference.getContext("2d")!;
  referenceContext.drawImage(
    await loadImage(crop.image),
    crop.content.x,
    crop.content.y,
    crop.content.width,
    crop.content.height,
    0,
    0,
    reference.width,
    reference.height,
  );
  const originalPixels = referenceContext.getImageData(
    0,
    0,
    reference.width,
    reference.height,
  );
  const generatedPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const originalLayout = analyzeFlatRegion(originalPixels),
    generatedLayout = analyzeFlatRegion(generatedPixels);
  if (originalLayout && !generatedLayout)
    throw new Error(
      "La IA no respetó una región de texto aislada. Añade feedback y regenera el parche.",
    );
  if (originalLayout && generatedLayout) {
    // The glyphs remain AI-authored. Geometry and ink/paper colors come only from the original.
    matchReferenceColors(generatedPixels.data, originalLayout, generatedLayout);
    const corrected = document.createElement("canvas");
    corrected.width = canvas.width;
    corrected.height = canvas.height;
    corrected.getContext("2d")!.putImageData(generatedPixels, 0, 0);
    ctx.fillStyle = `rgb(${originalLayout.background.join(",")})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const destination = fittedInk(
      originalLayout.ink,
      generatedLayout.ink,
      canvas.width,
    );
    const factorX = destination.width / generatedLayout.ink.width;
    const factorY = destination.height / generatedLayout.ink.height;
    ctx.drawImage(
      corrected,
      generatedLayout.ink.x - 1,
      generatedLayout.ink.y - 1,
      generatedLayout.ink.width + 2,
      generatedLayout.ink.height + 2,
      destination.x - factorX,
      destination.y - factorY,
      destination.width + factorX * 2,
      destination.height + factorY * 2,
    );
    // Resampling can shift a thresholded glyph edge by one pixel. Correct placement after resizing.
    const measured = analyzeFlatRegion(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
    if (
      measured &&
      (measured.ink.x !== destination.x || measured.ink.y !== destination.y)
    ) {
      corrected.getContext("2d")!.drawImage(canvas, 0, 0);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        corrected,
        destination.x - measured.ink.x,
        destination.y - measured.ink.y,
      );
    }
  }
  return canvas.toDataURL("image/png");
}
