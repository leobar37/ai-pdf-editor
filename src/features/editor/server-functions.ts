import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { editInputSchema } from "./edit-contract";
import type { EditResult } from "./edit-contract";
import { runEdit } from "./edit.server";
export const serverStatus = createServerFn({ method: "GET" }).handler(() => ({
  configured: Boolean(process.env.FAL_KEY),
}));
export const editCrop = createServerFn({ method: "POST" })
  .validator(editInputSchema)
  .handler(async ({ data }): Promise<EditResult> => {
    const request = getRequest();
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== new URL(request.url).host)
      return {
        ok: false,
        error: "La edición debe iniciarse desde esta aplicación.",
      };
    return runEdit(data, process.env.FAL_KEY);
  });
