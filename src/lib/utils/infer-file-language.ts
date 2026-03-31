/**
 * Infer language id (Monaco-style) from a path or filename via extension.
 * Uses lowercase suffix checks so `Foo.TSX` and `foo.tsx` match.
 */
export function inferFileLanguage(filePathOrName: string): string {
  const normalized = filePathOrName.toLowerCase();
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "ts";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "js";
  if (normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) return "js";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "md";
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html";
  if (normalized.endsWith(".svg")) return "svg";
  return "text";
}
