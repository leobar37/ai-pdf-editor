import { PDFDocument } from "pdf-lib";
export interface FlattenedPage {
  image: string;
  width: number;
  height: number;
}
export async function exportPdf(
  original: Uint8Array,
  editedPages: Map<number, FlattenedPage>,
) {
  const source = await PDFDocument.load(original, { updateMetadata: false });
  const result = await PDFDocument.create();
  for (let index = 0; index < source.getPageCount(); index++) {
    const flattened = editedPages.get(index + 1);
    if (flattened) {
      // New raster-only page: old text/annotations cannot remain hidden beneath a patch.
      const page = result.addPage([flattened.width, flattened.height]);
      const image = await result.embedPng(flattened.image);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: flattened.width,
        height: flattened.height,
      });
    } else {
      const [page] = await result.copyPages(source, [index]);
      result.addPage(page);
    }
  }
  result.setProducer("Parche · Editor PDF");
  result.setCreator("Parche");
  return result.save();
}
