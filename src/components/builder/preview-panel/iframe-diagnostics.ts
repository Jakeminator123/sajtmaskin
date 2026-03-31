import {
  previewDiagnosticCodeFromKind,
  previewDiagnosticStageFromKind,
} from "@/lib/gen/preview/diagnostics";

export type PreviewIssuePayload = {
  message?: string | null;
  name?: string | null;
  stack?: string | null;
  kind?: string | null;
  code?: string | null;
  stage?: string | null;
  source?: string | null;
};

export function detectOwnEnginePreviewIssue(doc: Document | null): PreviewIssuePayload | null {
  if (!doc?.body) return null;

  const diagnosticCode =
    doc.querySelector('meta[name="preview-error-code"]')?.getAttribute("content")?.trim() || null;
  const diagnosticStage =
    doc.querySelector('meta[name="preview-error-stage"]')?.getAttribute("content")?.trim() || null;
  const diagnosticSource =
    doc.querySelector('meta[name="preview-error-source"]')?.getAttribute("content")?.trim() || null;

  const root = doc.getElementById("root");
  const rootText = root?.innerText?.trim() || "";
  if (rootText.startsWith("Preview-fel")) {
    const kind = rootText.includes("Preview validation failed") ? "validation" : "runtime";
    return {
      message: rootText.replace(/^Preview-fel\s*/u, "").trim() || "Unknown preview error",
      kind,
      code: diagnosticCode || previewDiagnosticCodeFromKind(kind),
      stage: diagnosticStage || previewDiagnosticStageFromKind(kind),
      source: diagnosticSource || "own-engine-preview",
    };
  }

  if (!root) {
    const bodyText = doc.body.innerText.trim();
    if (bodyText) {
      return {
        message: bodyText,
        kind: "route",
        code: diagnosticCode || "preview_route_error",
        stage: diagnosticStage || "render-route",
        source: diagnosticSource || "preview-render-route",
      };
    }
  }

  return null;
}
