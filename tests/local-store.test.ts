import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  openLocalStore,
  readDraft,
  saveDraft,
} from "../src/features/editor/local-store";
afterEach(async () => {
  await saveDraft(null);
});
describe("browser-only draft storage", () => {
  it("restores the original bytes, page and patches, then deletes them explicitly", async () => {
    expect(await readDraft()).toBeUndefined();
    const draft = {
      name: "local.pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
      page: 2,
      patches: [
        {
          id: "patch",
          page: 2,
          rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
          image: "data:image/png;base64,local",
          replacement: "Roberto",
        },
      ],
    };
    await saveDraft(draft);
    expect(await readDraft()).toEqual(draft);
    await saveDraft(null);
    expect(await readDraft()).toBeUndefined();
  });
  it("stores only the latest draft", async () => {
    await saveDraft({
      name: "first.pdf",
      bytes: new Uint8Array([1]),
      page: 1,
      patches: [],
    });
    await saveDraft({
      name: "second.pdf",
      bytes: new Uint8Array([2]),
      page: 1,
      patches: [],
    });
    expect((await readDraft())?.name).toBe("second.pdf");
    const db = await openLocalStore();
    expect(db.objectStoreNames.contains("draft")).toBe(true);
    db.close();
  });
});
