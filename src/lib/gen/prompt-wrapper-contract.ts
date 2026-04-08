export const PROMPT_WRAPPER_HEADINGS = {
  continuity: "## Continuity (from previous generation)",
  existingProjectFilesReference: "## Existing Project Files (reference)",
  followUpEditingMode: "## Follow-up Editing Mode",
  requestedChanges: "## Requested Changes",
  contractClarificationAnswer: "## Contract Clarification Answer",
  userReply: "## User Reply",
} as const;

export function wrapWithSection(params: {
  heading: string;
  introLines?: string[];
  body?: string;
  trailingBody?: string;
  divider?: boolean;
}): string {
  const parts: string[] = [params.heading, ""];
  if (params.introLines && params.introLines.length > 0) {
    parts.push(...params.introLines.filter(Boolean), "");
  }
  if (typeof params.body === "string" && params.body.trim()) {
    parts.push(params.body.trim(), "");
  }
  if (params.divider) {
    parts.push("---", "");
  }
  if (typeof params.trailingBody === "string" && params.trailingBody.trim()) {
    parts.push(params.trailingBody.trim());
  } else if (parts.at(-1) === "") {
    parts.pop();
  }
  return parts.join("\n");
}
