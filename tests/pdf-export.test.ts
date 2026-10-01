import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, degrees } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { exportPdf } from "../src/features/editor/pdf-export";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=";
describe("local PDF export", () => {
  it("flattens edited pages, removes hidden original text and preserves untouched pages", async () => {
    const source = await PDFDocument.create();
    source.setTitle("Original sensitive metadata");
    const first = source.addPage([600, 800]);
    first.drawText("Pablito secreto", { x: 50, y: 400 });
    const second = source.addPage([400, 700]);
    second.drawText("Untouched text");
    second.setRotation(degrees(90));
    const bytes = await source.save();
    const result = await PDFDocument.load(
      await exportPdf(
        bytes,
        new Map([[1, { image, width: 600, height: 800 }]]),
      ),
    );
    expect(result.getPageCount()).toBe(2);
    expect(result.getTitle()).toBeUndefined();
    const edited = result.getPage(0);
    expect(edited.getSize()).toEqual({ width: 600, height: 800 });
    expect(
      edited.node.Resources()?.lookup(PDFName.of("Font"))?.toString(),
    ).toBe("<<\n>>");
    expect(
      (edited.node.get(PDFName.of("Annots")) as PDFArray | undefined)?.size() ??
        0,
    ).toBe(0);
    const contents = edited.node.Contents() as PDFArray;
    const streams = contents
      .asArray()
      .map((ref) => result.context.lookup(ref) as PDFRawStream);
    const text = streams
      .map((stream) => inflateSync(stream.getContents()).toString())
      .join("");
    expect(text).not.toMatch(/Tj|TJ|Pablito|secreto/);
    expect(text).toContain("Do");
    const unedited = result.getPage(1);
    expect(unedited.getSize()).toEqual({ width: 400, height: 700 });
    expect(unedited.getRotation().angle).toBe(90);
    expect(
      unedited.node.Resources()?.lookup(PDFName.of("Font"))?.toString(),
    ).toContain("Helvetica");
  });
  it("exports an unedited document without changing its dimensions", async () => {
    const source = await PDFDocument.create();
    source.addPage([700, 300]);
    const result = await PDFDocument.load(
      await exportPdf(await source.save(), new Map()),
    );
    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getSize()).toEqual({ width: 700, height: 300 });
  });
  it("uses display dimensions for rotated edited pages", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([300, 500]);
    page.setRotation(degrees(90));
    const result = await PDFDocument.load(
      await exportPdf(
        await source.save(),
        new Map([[1, { image, width: 500, height: 300 }]]),
      ),
    );
    expect(result.getPage(0).getSize()).toEqual({ width: 500, height: 300 });
    expect(result.getPage(0).getRotation().angle).toBe(0);
  });
  it("rejects invalid PDFs and invalid patch images", async () => {
    await expect(
      exportPdf(new Uint8Array([1, 2]), new Map()),
    ).rejects.toThrow();
    const source = await PDFDocument.create();
    source.addPage();
    await expect(
      exportPdf(
        await source.save(),
        new Map([[1, { image: "invalid", width: 500, height: 500 }]]),
      ),
    ).rejects.toBeDefined();
  });
});
