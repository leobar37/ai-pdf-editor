import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  MousePointer2,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
  Move,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Patch, PreparedCrop } from "./pdf-browser";
import { selectionRect, type Point, type Rect } from "./geometry";
import { exportPdf } from "./pdf-export";
import type { FlattenedPage } from "./pdf-export";
import { readDraft, saveDraft } from "./local-store";
import { editCrop, serverStatus } from "./server-functions";
import { movePatch, replacePatch, translatedPatchRect } from "./patch-state";

// PDF.js requires browser DOMMatrix and a Worker; it cannot be loaded during SSR.
const getPdfTools = () => import("./pdf-browser");
function FormInput({
  label,
  value,
  onChange,
  disabled,
  placeholder = "Por ejemplo, Roberto",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={500}
        autoComplete="off"
      />
    </label>
  );
}
function FormSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="form-field">
      <span>Ampliación del recorte</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      >
        <option value={2}>2× · Detalle normal</option>
        <option value={3}>3× · Más precisión</option>
        <option value={4}>4× · Texto pequeño</option>
      </select>
    </label>
  );
}
export function PdfEditor() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("");
  const [page, setPage] = useState(1);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [crop, setCrop] = useState<PreparedCrop | null>(null);
  const [candidate, setCandidate] = useState<Patch | null>(null);
  const [replacement, setReplacement] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activePatchId, setActivePatchId] = useState<string | null>(null);
  const [undoHistory, setUndoHistory] = useState<Patch[][]>([]);
  const [movingPatch, setMovingPatch] = useState<{
    id: string;
    rect: Rect;
  } | null>(null);
  const [multiplier, setMultiplier] = useState(3);
  const [consent, setConsent] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(595);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Solo en este navegador");
  const [restored, setRestored] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvasSlot = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dragStart = useRef<Point | null>(null);
  const patchDrag = useRef<{ id: string; start: Point; rect: Rect } | null>(
    null,
  );
  const currentPdf = useRef<PDFDocumentProxy | null>(null);
  const saves = useRef(Promise.resolve());
  const status = useQuery({
    queryKey: ["server-status"],
    queryFn: () => serverStatus(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const generation = useMutation({ mutationFn: editCrop });
  const busy =
    loading ||
    rendering ||
    exporting ||
    generation.isPending ||
    Boolean(movingPatch);
  const activePatch = patches.find((patch) => patch.id === activePatchId);

  function commitPatches(next: Patch[]) {
    setUndoHistory((history) => [...history.slice(-29), patches]);
    setPatches(next);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const draft = await readDraft();
        if (draft && alive) {
          const tools = await getPdfTools();
          const document = await tools.loadPdf(draft.bytes);
          if (!alive) {
            await document.destroy();
            return;
          }
          currentPdf.current = document;
          setPdf(document);
          setBytes(draft.bytes);
          setName(draft.name);
          setPatches(draft.patches);
          setPage(Math.min(Math.max(1, draft.page), document.numPages));
          setRestored(true);
        }
      } catch (err) {
        if (alive)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo recuperar el borrador local.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      void currentPdf.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!bytes || loading) return;
    const draft = { bytes, name, page, patches };
    setSaveState("Guardando localmente…");
    saves.current = saves.current
      .catch(() => undefined)
      .then(() => saveDraft(draft))
      .then(() => setSaveState("Guardado en este navegador"))
      .catch((err) => {
        setSaveState("No se pudo guardar");
        setError(err.message);
      });
  }, [bytes, name, page, patches, loading]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setRendering(true);
    canvas.current = null;
    void (async () => {
      try {
        const tools = await getPdfTools();
        const result = await tools.renderPage(pdf, page, patches);
        if (cancelled) return;
        setPageWidth(result.width);
        canvas.current = result.canvas;
        result.backgroundCanvas.style.width = "100%";
        result.backgroundCanvas.style.display = "block";
        canvasSlot.current?.replaceChildren(result.backgroundCanvas);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo mostrar la página.",
          );
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, patches]);

  async function openFile(file?: File) {
    if (!file || busy) return;
    setError("");
    if (file.size > 50 * 1024 * 1024) {
      setError("El PDF debe pesar menos de 50 MB.");
      return;
    }
    setLoading(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (!new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-"))
        throw new Error("El archivo no parece ser un PDF.");
      const tools = await getPdfTools();
      const document = await tools.loadPdf(data);
      await currentPdf.current?.destroy();
      currentPdf.current = document;
      setPdf(document);
      setBytes(data);
      setName(file.name);
      setPage(1);
      setPatches([]);
      setSelection(null);
      setCrop(null);
      setCandidate(null);
      setReplacement("");
      setConsent(false);
      setZoom(1);
      setActivePatchId(null);
      setFeedback("");
      setUndoHistory([]);
      setRestored(false);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "PasswordException"
          ? "Este PDF está protegido con contraseña. Abre una copia desbloqueada."
          : err instanceof Error
            ? err.message
            : "No se pudo abrir el PDF.",
      );
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }
  function pointerPosition(event: PointerEvent<HTMLDivElement>): Point {
    const bounds = (
      stage.current ?? event.currentTarget
    ).getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }
  function beginSelection(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || busy || candidate || !canvas.current || event.button !== 0)
      return;
    dragStart.current = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection(selectionRect(dragStart.current, dragStart.current));
    setCrop(null);
    setConsent(false);
    setError("");
    setActivePatchId(null);
    setFeedback("");
  }
  function moveSelection(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current)
      setSelection(selectionRect(dragStart.current, pointerPosition(event)));
  }
  async function finishSelection(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !canvas.current) return;
    const rect = selectionRect(dragStart.current, pointerPosition(event));
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    try {
      const tools = await getPdfTools();
      setCrop(tools.prepareCrop(canvas.current, rect, multiplier));
      setSelection(rect);
    } catch (err) {
      setSelection(null);
      setCrop(null);
      setError(
        err instanceof Error ? err.message : "No se pudo recortar la región.",
      );
    }
  }
  async function generatePatch() {
    if (!crop || !replacement.trim() || !consent || busy) return;
    setError("");
    setLoading(true);
    try {
      const result = await generation.mutateAsync({
        data: {
          image: crop.image,
          replacement,
          width: crop.width,
          height: crop.height,
          content: crop.content,
          consent: true,
          reference: crop.reference,
          feedback,
        },
      });
      if (!result.ok) throw new Error(result.error);
      const tools = await getPdfTools();
      const image = await tools.extractPatch(result.image, crop);
      setCandidate({
        id:
          activePatchId ??
          candidate?.id ??
          (crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`),
        page,
        rect: activePatch?.rect ?? crop.rect,
        image,
        replacement: replacement.trim(),
        sourceRect: activePatch?.sourceRect ?? crop.rect,
        background: activePatch?.background ?? crop.background,
        referenceCrop: crop,
        feedback,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo generar el parche.",
      );
    } finally {
      setLoading(false);
    }
  }
  function applyPatch() {
    if (!candidate) return;
    commitPatches(replacePatch(patches, candidate));
    setCandidate(null);
    setSelection(null);
    setCrop(null);
    setConsent(false);
    setReplacement("");
    setActivePatchId(null);
    setFeedback("");
  }
  function changePage(next: number) {
    if (busy || !pdf || next < 1 || next > pdf.numPages) return;
    setPage(next);
    setSelection(null);
    setCrop(null);
    setCandidate(null);
    setConsent(false);
    setError("");
    setActivePatchId(null);
    setFeedback("");
  }
  async function downloadPdf() {
    if (!bytes || !pdf || busy || candidate) return;
    setExporting(true);
    setError("");
    try {
      const flattened = new Map<number, FlattenedPage>();
      const tools = await getPdfTools();
      for (const number of new Set(patches.map((patch) => patch.page))) {
        const result = await tools.renderPage(pdf, number, patches, 3);
        flattened.set(number, {
          image: result.canvas.toDataURL("image/png"),
          width: result.width,
          height: result.height,
        });
      }
      const result = await exportPdf(bytes, flattened);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(result)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name.replace(/\.pdf$/i, "")}-editado.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo exportar el PDF.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function clearLocalDocument() {
    if (
      busy ||
      !window.confirm(
        "¿Borrar este PDF y todos sus parches guardados en este navegador?",
      )
    )
      return;
    setLoading(true);
    try {
      await saves.current;
      await saveDraft(null);
      await currentPdf.current?.destroy();
      currentPdf.current = null;
      setPdf(null);
      setBytes(null);
      setName("");
      setPatches([]);
      setSelection(null);
      setCrop(null);
      setCandidate(null);
      setActivePatchId(null);
      setFeedback("");
      setUndoHistory([]);
      setRestored(false);
      canvas.current = null;
      setSaveState("Datos locales borrados");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron borrar los datos locales.",
      );
    } finally {
      setLoading(false);
    }
  }
  function undoPatch() {
    if (busy || (!patches.length && !undoHistory.length)) return;
    setPatches(
      undoHistory.length
        ? undoHistory[undoHistory.length - 1]
        : patches.slice(0, -1),
    );
    setUndoHistory((history) => history.slice(0, -1));
    setActivePatchId(null);
    setFeedback("");
    setCrop(null);
    setCandidate(null);
    setSelection(null);
    setConsent(false);
  }
  async function changeMultiplier(value: number) {
    setMultiplier(value);
    setConsent(false);
    if (selection && canvas.current) {
      try {
        const tools = await getPdfTools();
        setCrop(tools.prepareCrop(canvas.current, selection, value));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo ampliar el recorte.",
        );
      }
    }
  }

  function startNewPatch() {
    if (busy) return;
    setDrawing(true);
    setActivePatchId(null);
    setCrop(null);
    setSelection(null);
    setCandidate(null);
    setFeedback("");
    setReplacement("");
    setConsent(false);
    setError("");
  }
  async function selectPatch(patch: Patch) {
    if (busy) return;
    setActivePatchId(patch.id);
    setDrawing(false);
    setPage(patch.page);
    setSelection(null);
    setCandidate(null);
    setReplacement(patch.replacement);
    setFeedback(patch.feedback ?? "");
    setConsent(false);
    setError("");
    if (patch.referenceCrop) {
      setCrop(patch.referenceCrop);
      return;
    }
    if (!pdf) return;
    setLoading(true);
    try {
      const tools = await getPdfTools();
      const original = await tools.renderPage(pdf, patch.page, []);
      const referenceCrop = tools.prepareCrop(
        original.canvas,
        patch.sourceRect ?? patch.rect,
        multiplier,
      );
      setCrop(referenceCrop);
      setPatches((previous) =>
        replacePatch(previous, {
          ...patch,
          referenceCrop,
          sourceRect: patch.sourceRect ?? patch.rect,
          background: patch.background ?? referenceCrop.background,
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo recuperar la referencia original.",
      );
    } finally {
      setLoading(false);
    }
  }
  function beginMove(event: PointerEvent<HTMLDivElement>, patch: Patch) {
    if (drawing || busy || candidate || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (activePatchId !== patch.id) void selectPatch(patch);
    if (!patch.background) {
      setError(
        "Selecciona el parche y prepara su fondo antes de moverlo; así no reaparecerá el texto antiguo.",
      );
      return;
    }
    patchDrag.current = {
      id: patch.id,
      start: pointerPosition(event),
      rect: patch.rect,
    };
    setMovingPatch({ id: patch.id, rect: patch.rect });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragPatch(event: PointerEvent<HTMLDivElement>) {
    const drag = patchDrag.current;
    if (!drag) return;
    event.stopPropagation();
    setMovingPatch({
      id: drag.id,
      rect: translatedPatchRect(drag.rect, drag.start, pointerPosition(event)),
    });
  }
  function finishMove(event: PointerEvent<HTMLDivElement>) {
    const drag = patchDrag.current;
    if (!drag) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = translatedPatchRect(
      drag.rect,
      drag.start,
      pointerPosition(event),
    );
    patchDrag.current = null;
    setMovingPatch(null);
    commitPatches(movePatch(patches, drag.id, rect));
  }
  async function prepareMoveBackground() {
    if (!activePatch || !crop || !consent || busy || candidate) return;
    setError("");
    setLoading(true);
    try {
      const result = await generation.mutateAsync({
        data: {
          image: crop.image,
          replacement: activePatch.replacement,
          width: crop.width,
          height: crop.height,
          content: crop.content,
          consent: true,
          purpose: "erase",
        },
      });
      if (!result.ok) throw new Error(result.error);
      const tools = await getPdfTools();
      const background = await tools.extractPatch(result.image, crop, "erase");
      commitPatches(
        replacePatch(patches, {
          ...activePatch,
          background,
          sourceRect: activePatch.sourceRect ?? crop.rect,
          referenceCrop: crop,
        }),
      );
      setConsent(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo preparar el fondo original.",
      );
    } finally {
      setLoading(false);
    }
  }
  function deleteActivePatch() {
    if (!activePatchId || busy) return;
    commitPatches(patches.filter((patch) => patch.id !== activePatchId));
    startNewPatch();
  }
  const pagePatches = patches.filter((patch) => patch.page === page);
  return (
    <div
      className="app-shell"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void openFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        aria-label="Seleccionar PDF local"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void openFile(event.target.files?.[0])
        }
      />
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <ScanLine size={22} />
          </span>
          parche<span className="brand-dot">.</span>
        </a>
        <span className="product-label">TU EDITOR PDF, POR PARTES</span>
        <div className="top-actions">
          <span className="privacy-pill">
            <LockKeyhole size={13} /> Local primero
          </span>
          <button
            className="button primary"
            onClick={() => void downloadPdf()}
            disabled={!pdf || busy || Boolean(candidate)}
          >
            {exporting ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowDownToLine size={16} />
            )}{" "}
            Exportar PDF
          </button>
        </div>
      </header>
      <div className="body-layout">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">MESA DE TRABAJO</span>
            <span className="version">01</span>
          </div>
          <section className="document-section">
            <h2>Tu documento</h2>
            <button
              className="file-card"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <span className="file-icon">
                <FileText size={21} />
              </span>
              <span className="file-info">
                <strong>{name || "Abre un PDF"}</strong>
                <small>
                  {pdf
                    ? `${pdf.numPages} páginas · Archivo local`
                    : "Desde tu dispositivo"}
                </small>
              </span>
              <FolderOpen size={16} />
            </button>
            {pdf && (
              <div className="document-meta">
                <span>
                  <i className="status-dot" />
                  {saveState}
                </span>
                <button
                  className="icon-button danger"
                  title="Borrar datos locales"
                  aria-label="Borrar datos locales"
                  disabled={busy}
                  onClick={() => void clearLocalDocument()}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </section>
          <section className="patch-section">
            <div className="section-title">
              <h2>Un cambio puntual</h2>
              <span className="step-tag">PARCHE</span>
            </div>
            <p className="section-description">
              Selecciona el texto. Escribe lo nuevo.
              <br />
              El resto se queda como está.
            </p>
            <button
              className={`button selection-tool ${drawing && pdf ? "selected" : ""}`}
              disabled={!pdf || busy}
              onClick={startNewPatch}
            >
              <MousePointer2 size={17} />
              Nuevo parche
              <span className="key-hint">↗</span>
            </button>
            <button
              className={`button move-tool ${!drawing && pdf ? "selected" : ""}`}
              disabled={!pdf || busy || Boolean(candidate)}
              onClick={() => setDrawing(false)}
            >
              <Move size={16} /> Mover / seleccionar parches
            </button>
            <div className="crop-preview">
              {crop ? (
                <>
                  <div className="crop-image">
                    <img
                      src={crop.preview}
                      alt="Recorte exacto que se enviará a la IA"
                    />
                  </div>
                  <div className="crop-caption">
                    <span>
                      <Check size={12} /> Solo esta región
                    </span>
                    <span>
                      {crop.width} × {crop.height} px
                    </span>
                  </div>
                  <div className="reference-metrics">
                    {crop.measurements
                      ? `Texto original: ${crop.measurements.widthMm.toFixed(2)} × ${crop.measurements.heightMm.toFixed(2)} mm · medidas bloqueadas`
                      : crop.reference
                        ? "Ancho, alto, posición y color originales bloqueados"
                        : "Referencia sin medidas aislables: revisa la tipografía del resultado"}
                  </div>
                </>
              ) : (
                <div className="crop-placeholder">
                  <ScanLine size={24} />
                  <span>Tu recorte aparecerá aquí</span>
                  <small>Arrastra un cuadro sobre la página</small>
                </div>
              )}
            </div>
            <FormInput
              label="Texto de sustitución"
              value={replacement}
              onChange={(value) => {
                setReplacement(value);
                setConsent(false);
              }}
              disabled={!crop || busy}
            />
            <FormSelect
              value={multiplier}
              onChange={(value) => void changeMultiplier(value)}
              disabled={
                !pdf || busy || Boolean(candidate) || Boolean(activePatch)
              }
            />
            <FormInput
              label="Feedback para regenerar"
              placeholder="Misma fuente, trazos más finos, sin cambiar medidas"
              value={feedback}
              onChange={(value) => {
                setFeedback(value);
                setConsent(false);
              }}
              disabled={!crop || busy}
            />
            {activePatch && (
              <div className="active-patch-panel">
                <span>
                  Parche seleccionado · arrástralo en modo mover. Usa las
                  flechas para ajustes finos.
                </span>
                {!activePatch.background && (
                  <button
                    className="button quiet"
                    disabled={!consent || busy || Boolean(candidate)}
                    onClick={() => void prepareMoveBackground()}
                  >
                    <Move size={14} /> Preparar fondo para mover (IA)
                  </button>
                )}
                <button
                  className="button quiet"
                  disabled={busy || Boolean(candidate)}
                  onClick={deleteActivePatch}
                >
                  <Trash2 size={14} /> Eliminar este parche
                </button>
              </div>
            )}
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={!crop || busy}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Enviar solo este recorte y el texto nuevo a fal.ai. La edición
                consume créditos.
              </span>
            </label>
            <button
              className="button generate"
              onClick={() => void generatePatch()}
              disabled={
                !crop ||
                !replacement.trim() ||
                !consent ||
                busy ||
                !status.data?.configured
              }
            >
              {generation.isPending ? (
                <LoaderCircle size={17} className="spin" />
              ) : activePatch || candidate ? (
                <RefreshCw size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {generation.isPending
                ? "Reconstruyendo el recorte…"
                : activePatch || candidate
                  ? "Regenerar parche"
                  : "Generar parche"}
              <ArrowRight size={16} />
            </button>
            {candidate && (
              <div className="candidate-panel">
                <span className="eyebrow">ANTES DE APLICAR</span>
                <img
                  src={candidate.image}
                  alt="Parche generado pendiente de aplicar"
                />
                <p>Revisa el texto y el fondo. La IA puede cometer errores.</p>
                <div className="candidate-actions">
                  <button
                    className="button primary"
                    onClick={applyPatch}
                    disabled={busy}
                  >
                    <Check size={15} /> Aplicar parche
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Descartar parche"
                    title="Descartar parche"
                    onClick={() => setCandidate(null)}
                    disabled={busy}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            )}
          </section>
          {(patches.length > 0 || undoHistory.length > 0) && (
            <section className="history-section">
              <div className="section-title">
                <h2>Parches aplicados</h2>
                <span className="count">{patches.length}</span>
              </div>
              {patches.map((patch, index) => (
                <button
                  className={`history-item ${activePatchId === patch.id ? "active" : ""}`}
                  key={patch.id}
                  type="button"
                  aria-pressed={activePatchId === patch.id}
                  onClick={() => void selectPatch(patch)}
                  disabled={busy}
                >
                  <span className="history-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{patch.replacement}</strong>
                    <small>Página {patch.page}</small>
                  </span>
                  <Check size={14} />
                </button>
              ))}
              <button
                className="button quiet"
                onClick={undoPatch}
                disabled={busy}
              >
                <Undo2 size={15} /> Deshacer último
              </button>
            </section>
          )}
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <div>
              <strong>El PDF no sale de aquí.</strong>
              <p>
                Documento y parches se guardan en este navegador. Solo el
                recorte confirmado llega a fal.ai y a su proveedor de IA.
              </p>
              <small>
                Sin historial de entradas/salidas en fal. Esto no garantiza
                retención cero del proveedor.
              </small>
            </div>
          </div>
        </aside>
        <main className="workspace">
          <div className="workspace-toolbar">
            <div className="breadcrumb">
              <span>Documentos</span>
              <span>/</span>
              <strong>{name || "Sin título"}</strong>
              {restored && <span className="restored-label">Recuperado</span>}
            </div>
            <div className="view-controls">
              <button
                className="icon-button"
                disabled={!pdf || busy || zoom <= 0.5}
                aria-label="Alejar"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.15))}
              >
                <ZoomOut size={16} />
              </button>
              <span>{Math.round(zoom * 100)} %</span>
              <button
                className="icon-button"
                disabled={!pdf || busy || zoom >= 2}
                aria-label="Acercar"
                onClick={() => setZoom(Math.min(2, zoom + 0.15))}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Cerrar error"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {status.isSuccess && !status.data.configured && (
            <div className="error-banner" role="alert">
              La credencial fal.ai aún no está configurada en el servidor. La
              carga y exportación local siguen disponibles.
            </div>
          )}
          <div className={`workspace-content ${pdf ? "has-document" : ""}`}>
            {!pdf ? (
              <div className="welcome">
                <span className="eyebrow">
                  <span className="small-line" /> MENOS ENVÍOS. MÁS CONTROL.
                </span>
                <h1>
                  Un pequeño cambio.
                  <br />
                  <em>No todo tu documento.</em>
                </h1>
                <p>
                  Corrige ese nombre, esa palabra, ese detalle.
                  <br />
                  La IA ve un recorte. Tú conservas el resto.
                </p>
                <button
                  className={`drop-zone ${dragOver ? "drag-over" : ""}`}
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <div className="drop-art">
                    <div className="paper-art">
                      <div className="paper-fold" />
                      <span />
                      <span />
                      <span />
                      <div className="art-selection">
                        Pablito <span>→ Roberto</span>
                      </div>
                      <span />
                      <span />
                    </div>
                    <span className="plus-badge">
                      <Plus size={20} />
                    </span>
                  </div>
                  <strong>
                    {loading ? "Preparando tu espacio…" : "Suelta tu PDF aquí"}
                  </strong>
                  <span>o haz clic para elegir un archivo</span>
                  <small>
                    PDF · Hasta 50 MB · Guardado solo en este navegador
                  </small>
                </button>
                <div className="workflow">
                  <span>
                    <b>01</b> Selecciona
                  </span>
                  <span className="flow-line" />
                  <span>
                    <b>02</b> Sustituye
                  </span>
                  <span className="flow-line" />
                  <span>
                    <b>03</b> Exporta
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="page-hint">
                  <MousePointer2 size={13} />
                  {candidate
                    ? "Vista previa del parche · aplícalo o descártalo"
                    : generation.isPending
                      ? "La IA está trabajando solo en tu recorte"
                      : drawing
                        ? "Arrastra para seleccionar la región que quieres cambiar"
                        : "Selecciona y arrastra un parche · flechas para ajustes finos"}
                </div>
                <div className="page-scroll">
                  <div
                    ref={stage}
                    className={`pdf-stage ${drawing ? "drawing" : ""}`}
                    style={{ width: pageWidth * zoom }}
                    onPointerDown={beginSelection}
                    onPointerMove={moveSelection}
                    onPointerUp={(event) => void finishSelection(event)}
                    onPointerCancel={() => {
                      dragStart.current = null;
                      setSelection(null);
                    }}
                    role="group"
                    aria-label={`Página ${page} del PDF. Arrastra para seleccionar un recorte.`}
                  >
                    <div ref={canvasSlot} />
                    {pagePatches.map((patch) => {
                      const rect =
                        movingPatch?.id === patch.id
                          ? movingPatch.rect
                          : patch.rect;
                      return (
                        <div
                          key={patch.id}
                          className={`applied-patch ${activePatchId === patch.id ? "active" : ""}`}
                          role="button"
                          aria-label={`Seleccionar o mover parche: ${patch.replacement}`}
                          tabIndex={drawing ? -1 : 0}
                          style={{
                            left: `${rect.x * 100}%`,
                            top: `${rect.y * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: `${rect.height * 100}%`,
                            pointerEvents:
                              drawing || candidate ? "none" : "auto",
                          }}
                          onPointerDown={(event) => beginMove(event, patch)}
                          onPointerMove={dragPatch}
                          onPointerUp={finishMove}
                          onPointerCancel={() => {
                            patchDrag.current = null;
                            setMovingPatch(null);
                          }}
                          onKeyDown={(event) => {
                            if (busy || drawing || candidate) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void selectPatch(patch);
                              return;
                            }
                            const dx =
                              event.key === "ArrowLeft"
                                ? -1
                                : event.key === "ArrowRight"
                                  ? 1
                                  : 0;
                            const dy =
                              event.key === "ArrowUp"
                                ? -1
                                : event.key === "ArrowDown"
                                  ? 1
                                  : 0;
                            if (!dx && !dy) return;
                            event.preventDefault();
                            if (!patch.background) {
                              setError(
                                "Prepara el fondo de este parche antes de moverlo.",
                              );
                              return;
                            }
                            const bounds =
                              stage.current!.getBoundingClientRect();
                            const step = event.shiftKey ? 10 : 1;
                            commitPatches(
                              movePatch(
                                patches,
                                patch.id,
                                translatedPatchRect(
                                  patch.rect,
                                  { x: 0, y: 0 },
                                  {
                                    x: (dx * step) / bounds.width,
                                    y: (dy * step) / bounds.height,
                                  },
                                ),
                              ),
                            );
                          }}
                        >
                          <img src={patch.image} alt="" draggable={false} />
                        </div>
                      );
                    })}
                    {selection && (
                      <div
                        className="selection-rect"
                        style={{
                          left: `${selection.x * 100}%`,
                          top: `${selection.y * 100}%`,
                          width: `${selection.width * 100}%`,
                          height: `${selection.height * 100}%`,
                        }}
                      >
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                    {candidate && (
                      <img
                        className="candidate-overlay"
                        src={candidate.image}
                        alt="Vista previa en su posición original"
                        style={{
                          left: `${candidate.rect.x * 100}%`,
                          top: `${candidate.rect.y * 100}%`,
                          width: `${candidate.rect.width * 100}%`,
                          height: `${candidate.rect.height * 100}%`,
                        }}
                      />
                    )}
                    {rendering && (
                      <div className="rendering-overlay">
                        <LoaderCircle className="spin" /> Mostrando página…
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <footer className="workspace-footer">
            <span>
              <i className="status-dot" />
              {pdf
                ? `${pagePatches.length} parches en esta página`
                : "Tu archivo permanece en tu dispositivo"}
            </span>
            {pdf ? (
              <div className="pagination">
                <button
                  className="icon-button"
                  aria-label="Página anterior"
                  disabled={busy || page <= 1}
                  onClick={() => changePage(page - 1)}
                >
                  <ArrowLeft size={15} />
                </button>
                <span>
                  Página <b>{page}</b> de {pdf.numPages}
                </span>
                <button
                  className="icon-button"
                  aria-label="Página siguiente"
                  disabled={busy || page >= pdf.numPages}
                  onClick={() => changePage(page + 1)}
                >
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <span className="footer-brand">HECHO PARA LOS DETALLES</span>
            )}
          </footer>
          {pdf && (
            <p className="export-note">
              Al exportar, las páginas editadas se convierten en imagen para no
              dejar el texto anterior oculto. Las demás conservan su contenido
              original. La edición invalida firmas digitales.
            </p>
          )}
        </main>
      </div>
      {dragOver && (
        <div className="drop-overlay">
          <FileText size={40} />
          <strong>Suelta el PDF para abrirlo localmente</strong>
          <span>No se subirá el documento</span>
        </div>
      )}
    </div>
  );
}
