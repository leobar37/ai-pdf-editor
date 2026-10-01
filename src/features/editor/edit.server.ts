import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  buildFalInput,
  editInputSchema,
  type EditInput,
  type EditResult,
} from "./edit-contract";
const MODEL = "fal-ai/nano-banana-2/edit";
const queueRecord = z.object({
  status_url: z.string(),
  response_url: z.string(),
  cancel_url: z.string(),
});
let active = false;
let submissions: number[] = [];
export function verifyPng(data: string, width?: number, height?: number) {
  const bytes = Buffer.from(data.substring(data.indexOf(",") + 1), "base64");
  if (
    bytes.length < 33 ||
    bytes.length > 9_000_000 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  )
    throw new Error("El recorte no es un PNG válido.");
  const w = bytes.readUInt32BE(16),
    h = bytes.readUInt32BE(20);
  if (
    w < 1 ||
    h < 1 ||
    w > 4096 ||
    h > 4096 ||
    (width !== undefined && w !== width) ||
    (height !== undefined && h !== height)
  )
    throw new Error("Las dimensiones del recorte no son válidas.");
}
export function queueUrl(value: string) {
  const url = new URL(value);
  if (
    url.origin !== "https://queue.fal.run" ||
    !url.pathname.startsWith("/fal-ai/nano-banana-2/") ||
    url.username ||
    url.password
  )
    throw new Error("La respuesta de fal.ai no es válida.");
  return url.toString();
}
export async function runEdit(
  rawInput: EditInput,
  key: string | undefined,
  transport: typeof fetch = fetch,
): Promise<EditResult> {
  const parsed = editInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Solicitud inválida: envía únicamente un recorte PNG y el texto nuevo.",
    };
  const input = parsed.data;
  if (!key)
    return { ok: false, error: "Falta configurar FAL_KEY en el servidor." };
  try {
    verifyPng(input.image, input.width, input.height);
  } catch {
    return { ok: false, error: "El PNG o sus dimensiones no son válidos." };
  }
  const now = Date.now();
  submissions = submissions.filter((time) => now - time < 60_000);
  if (active || submissions.length >= 6)
    return {
      ok: false,
      error: "Espera a que termine la edición actual o inténtalo en un minuto.",
    };
  active = true;
  submissions.push(now);
  const signal = AbortSignal.timeout(180_000);
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
    "X-Fal-Store-IO": "0",
    "X-Fal-No-Retry": "1",
    "X-Fal-Request-Timeout": "60",
    "x-app-fal-disable-fallback": "true",
    "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
      expiration_duration_seconds: 300,
    }),
  };
  let cancelUrl: string | undefined;
  try {
    const submitted = await transport(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildFalInput(input)),
      signal,
      redirect: "error",
    });
    if (!submitted.ok)
      return {
        ok: false,
        error:
          submitted.status === 401 || submitted.status === 403
            ? "fal.ai rechazó la credencial del servidor."
            : "fal.ai no pudo iniciar la edición. Revisa el saldo o inténtalo más tarde.",
      };
    const record = queueRecord.parse(await submitted.json());
    const statusUrl = queueUrl(record.status_url),
      responseUrl = queueUrl(record.response_url);
    cancelUrl = queueUrl(record.cancel_url);
    for (;;) {
      const statusResponse = await transport(statusUrl, {
        headers,
        signal,
        redirect: "error",
      });
      if (!statusResponse.ok) throw new Error("Fal status failed");
      const status = z
        .object({
          status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]),
          error: z.unknown().optional(),
        })
        .parse(await statusResponse.json());
      if (status.status === "COMPLETED") {
        if (status.error) throw new Error("Fal generation failed");
        break;
      }
      await delay(1500, undefined, { signal });
    }
    const result = await transport(responseUrl, {
      headers,
      signal,
      redirect: "error",
    });
    if (!result.ok) throw new Error("Fal result failed");
    const output = z
      .object({
        images: z
          .array(
            z.object({
              url: z
                .string()
                .max(12_000_000)
                .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
            }),
          )
          .min(1),
      })
      .parse(await result.json());
    verifyPng(output.images[0].url);
    return { ok: true, image: output.images[0].url };
  } catch {
    if (cancelUrl)
      await transport(cancelUrl, {
        method: "PUT",
        headers,
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      }).catch(() => undefined);
    return {
      ok: false,
      error: signal.aborted
        ? "La edición tardó demasiado. Se intentó cancelarla; fal.ai podría haber iniciado el procesamiento."
        : "No se pudo obtener un parche válido de fal.ai. El documento local no ha cambiado.",
    };
  } finally {
    active = false;
  }
}
