import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFalInput,
  editInputSchema,
} from "../src/features/editor/edit-contract";
import type { EditInput } from "../src/features/editor/edit-contract";
import {
  runEdit,
  queueUrl,
  verifyPng,
} from "../src/features/editor/edit.server";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=";
const input: EditInput = {
  image: png,
  replacement: "Roberto",
  width: 1,
  height: 1,
  content: { x: 0, y: 0, width: 1, height: 1 },
  consent: true,
};
const record = {
  status_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/test/status",
  response_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/test",
  cancel_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/test/cancel",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let time = Date.now();
beforeEach(() => {
  vi.useFakeTimers();
  time += 61_000;
  vi.setSystemTime(time);
});
afterEach(() => vi.useRealTimers());
describe("crop-only edit boundary", () => {
  it("never includes a PDF, file name, page or external URL in the model input", () => {
    const payload = buildFalInput(input);
    expect(Object.keys(payload)).toEqual([
      "image_urls",
      "prompt",
      "num_images",
      "output_format",
      "resolution",
      "aspect_ratio",
      "sync_mode",
      "enable_web_search",
      "limit_generations",
    ]);
    expect(payload.image_urls).toEqual([png]);
    expect(payload.prompt).toContain('"Roberto"');
    expect(payload.sync_mode).toBe(true);
    expect(payload).not.toHaveProperty("pdf_url");
    expect(payload).not.toHaveProperty("video_url");
    expect(
      editInputSchema.safeParse({ ...input, pdf: "secret.pdf" }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({ ...input, image: "https://evil.test/pdf" })
        .success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({
        ...input,
        image: "data:application/pdf;base64,UEZERg==",
      }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({ ...input, consent: false }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({
        ...input,
        content: { ...input.content, x: 2 },
      }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({ ...input, replacement: "  " }).success,
    ).toBe(false);
  });
  it("passes measured reference dimensions, color and feedback without extra document data", () => {
    const reference = {
      bounds: { x: 2, y: 3, width: 25, height: 8 },
      foreground: [0, 0, 0] as [number, number, number],
      background: [255, 255, 255] as [number, number, number],
    };
    const data = {
      ...input,
      width: 30,
      height: 15,
      content: { x: 0, y: 0, width: 30, height: 15 },
      reference,
      feedback: "Use thinner strokes, same font.",
    };
    const payload = buildFalInput(data);
    expect(editInputSchema.safeParse(data).success).toBe(true);
    expect(payload.prompt).toContain(JSON.stringify(reference.bounds));
    expect(payload.prompt).toContain("BOTH width and height");
    expect(payload.prompt).toContain("Use thinner strokes, same font.");
    expect(payload.image_urls).toEqual([png]);
    expect(
      editInputSchema.safeParse({
        ...data,
        reference: { ...reference, bounds: { ...reference.bounds, x: 20 } },
      }).success,
    ).toBe(false);
    expect(
      editInputSchema.safeParse({ ...data, feedback: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
  it("prepares only the background when moving a patch over complex paper", () => {
    const payload = buildFalInput({
      ...input,
      purpose: "erase",
      feedback: "This must not become an erase instruction override",
    });
    expect(payload.prompt).toContain("Remove all text");
    expect(payload.prompt).not.toContain("Roberto");
    expect(payload.prompt).not.toContain("instruction override");
  });
  it("sends one crop with privacy headers and returns only a local image", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(record))
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(json({ images: [{ url: png }] }));
    expect(await runEdit(input, "server-only-key", transport)).toEqual({
      ok: true,
      image: png,
    });
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe("https://queue.fal.run/fal-ai/nano-banana-2/edit");
    const headers = options!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key server-only-key");
    expect(headers["X-Fal-Store-IO"]).toBe("0");
    expect(headers["X-Fal-No-Retry"]).toBe("1");
    expect(JSON.parse(options!.body as string)).toEqual(buildFalInput(input));
    expect(options!.redirect).toBe("error");
  });
  it("does not contact fal when credentials or PNG are invalid", async () => {
    const transport = vi.fn<typeof fetch>();
    expect((await runEdit(input, undefined, transport)).ok).toBe(false);
    expect(
      (
        await runEdit(
          { ...input, image: "data:image/png;base64,UEZERg==" },
          "key",
          transport,
        )
      ).ok,
    ).toBe(false);
    expect((await runEdit({ ...input, width: 3 }, "key", transport)).ok).toBe(
      false,
    );
    expect(
      (await runEdit({ ...input, replacement: "" }, "key", transport)).ok,
    ).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
  it("sanitizes provider authorization errors", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ detail: "server-only-secret" }, 401));
    const result = await runEdit(input, "key", transport);
    expect(result).toEqual({
      ok: false,
      error: "fal.ai rechazó la credencial del servidor.",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("shows a safe message for credit or service failure", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({}, 402));
    expect((await runEdit(input, "key", transport)).ok).toBe(false);
  });
  it("rejects malicious queue URLs without leaking the key to them", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ ...record, status_url: "https://evil.test/status" }),
      );
    expect((await runEdit(input, "key", transport)).ok).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(() =>
      queueUrl("https://queue.fal.run@evil.test/fal-ai/nano-banana-2/status"),
    ).toThrow();
    expect(() =>
      queueUrl("https://queue.fal.run/other-model/status"),
    ).toThrow();
  });
  it("refuses a CDN output instead of making arbitrary remote downloads", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(record))
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        json({ images: [{ url: "https://cdn.test/output.png" }] }),
      )
      .mockResolvedValueOnce(json({}));
    expect((await runEdit(input, "key", transport)).ok).toBe(false);
    expect(transport.mock.calls[3][1]?.method).toBe("PUT");
    expect(
      transport.mock.calls.every(([url]) =>
        String(url).startsWith("https://queue.fal.run/"),
      ),
    ).toBe(true);
  });
  it("waits for a queued request and then downloads the result", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(record))
      .mockResolvedValueOnce(json({ status: "IN_QUEUE" }))
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(json({ images: [{ url: png }] }));
    const promise = runEdit(input, "key", transport);
    // The implementation uses node timers, so allow its single 1.5s wait to finish.
    vi.useRealTimers();
    expect(await promise).toEqual({ ok: true, image: png });
  });
  it("prevents overlapping paid requests", async () => {
    const gate = Promise.withResolvers<Response>();
    const transport = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(json({ images: [{ url: png }] }));
    const first = runEdit(input, "key", transport);
    expect((await runEdit(input, "key", transport)).ok).toBe(false);
    gate.resolve(json(record));
    expect((await first).ok).toBe(true);
  });
  it("handles status and generation failure, attempting cancellation", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(record))
      .mockResolvedValueOnce(
        json({ status: "COMPLETED", error: "private provider detail" }),
      )
      .mockResolvedValueOnce(json({}));
    const result = await runEdit(input, "key", transport);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private provider");
    expect(transport.mock.calls[2][1]?.method).toBe("PUT");
  });
  it("checks PNG signatures and IHDR dimensions", () => {
    expect(() => verifyPng(png, 1, 1)).not.toThrow();
    expect(() => verifyPng("data:image/png;base64,UEZERg==")).toThrow();
    expect(() => verifyPng(png, 2, 1)).toThrow();
    const bytes = Buffer.from(png.split(",")[1], "base64");
    bytes.writeUInt32BE(5000, 16);
    expect(() =>
      verifyPng("data:image/png;base64," + bytes.toString("base64")),
    ).toThrow();
  });
});
