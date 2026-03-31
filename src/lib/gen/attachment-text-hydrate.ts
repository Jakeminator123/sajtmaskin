import {
  getRequestAttachmentMediaType,
  isImageRequestAttachment,
  type RequestAttachment,
} from "./request-metadata";

export type HydrateTextAttachmentsOptions = {
  signal?: AbortSignal;
  maxPerFileChars?: number;
  maxTotalChars?: number;
  fetchTimeoutMs?: number;
};

function isLikelyTextAttachment(attachment: RequestAttachment): boolean {
  if (isImageRequestAttachment(attachment)) return false;
  const mime = (getRequestAttachmentMediaType(attachment) || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "application/xml") return true;
  if (mime.endsWith("+json") || mime.endsWith("+xml")) return true;
  const fn = (attachment.filename || "").toLowerCase();
  return /\.(txt|md|mdx|csv|json|xml|html?|css|scss|ts|tsx|js|jsx|svg)$/i.test(fn);
}

function sliceUtf8(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n… (truncated)`;
}

/**
 * Fetches text-like attachments and appends fenced excerpts so the codegen model
 * sees document content (images stay on the multimodal path only).
 */
export async function appendHydratedTextAttachmentExcerpts(
  prompt: string,
  attachments: RequestAttachment[] | undefined,
  options?: HydrateTextAttachmentsOptions,
): Promise<string> {
  const list = attachments ?? [];
  const candidates = list.filter(isLikelyTextAttachment);
  if (candidates.length === 0) return prompt;

  const maxPerFile = options?.maxPerFileChars ?? 12_000;
  const maxTotal = options?.maxTotalChars ?? 36_000;
  const timeoutMs = options?.fetchTimeoutMs ?? 5_000;
  const signal = options?.signal;

  const sections: string[] = [
    "## Attachment text excerpts",
    "",
    "Fetched server-side for text-like files. Prefer this content over guessing.",
    "",
  ];
  let used = 0;

  for (const attachment of candidates) {
    if (used >= maxTotal) break;
    const label =
      attachment.filename?.trim() ||
      (() => {
        try {
          return decodeURIComponent(new URL(attachment.url).pathname.split("/").pop() || "file");
        } catch {
          return "file";
        }
      })();
    const budget = Math.min(maxPerFile, maxTotal - used);
    if (budget < 200) break;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(attachment.url, {
        signal: signal ? AbortSignal.any([signal, ac.signal]) : ac.signal,
        headers: { Accept: "text/*, application/json, application/xml, */*" },
      });
      clearTimeout(t);
      if (!res.ok) {
        sections.push(`### ${label}`, "", `_Fetch failed (${res.status})_`, "");
        continue;
      }
      const raw = await res.text();
      const excerpt = sliceUtf8(raw, budget);
      used += excerpt.length;
      sections.push(`### ${label}`, "", "```", excerpt, "```", "");
    } catch {
      clearTimeout(t);
      sections.push(`### ${label}`, "", `_Could not load attachment text._`, "");
    }
  }

  if (sections.length <= 4) return prompt;

  return `${prompt.trimEnd()}\n\n${sections.join("\n").trimEnd()}`;
}
