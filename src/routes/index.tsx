import { createFileRoute } from "@tanstack/react-router";
import { PdfEditor } from "../features/editor/PdfEditor";
export const Route = createFileRoute("/")({ component: PdfEditor });
