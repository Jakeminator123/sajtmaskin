/**
 * Prompt formatting for the prompt-wizard. Not used on the create-chat path.
 */

function normalizeWhitespace(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmedLines = normalized.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return trimmedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStructuredPrompt(value: string): boolean {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const normalizedHeadings = new Set(
    lines.map((line) =>
      line
        .toLowerCase()
        .replace(/[^a-z0-9åäö#/_-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  const headingCandidates = [
    "mal",
    "mål",
    "sektioner",
    "stil",
    "constraints",
    "tillganglighet",
    "tillgänglighet",
    "assets/attachments",
    "## build intent",
    "## project context",
    "## quality bar",
  ];
  const hitCount = headingCandidates.reduce(
    (count, candidate) => count + (normalizedHeadings.has(candidate) ? 1 : 0),
    0,
  );
  return hitCount >= 2;
}

const ACCESSIBILITY_REQUIREMENTS = [
  "Dialoger måste ha DialogTitle + DialogDescription (sr-only ok) eller korrekt aria-describedby.",
];

export function formatPrompt(prompt: string): string {
  if (!prompt) return "";
  const normalized = normalizeWhitespace(String(prompt));
  if (!normalized) return "";
  if (isStructuredPrompt(normalized)) return normalized;

  return [
    "MÅL",
    normalized,
    "TILLGÄNGLIGHET",
    ACCESSIBILITY_REQUIREMENTS.map((line) => `- ${line}`).join("\n"),
  ].join("\n\n");
}
