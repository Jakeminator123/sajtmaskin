/**
 * Custom error classes thrown by the finalize-version pipeline.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

export class EmptyGenerationError extends Error {
  readonly chatId: string;
  readonly scaffoldId: string | null;

  constructor(chatId: string, scaffoldId: string | null) {
    super("Generation produced no code output");
    this.name = "EmptyGenerationError";
    this.chatId = chatId;
    this.scaffoldId = scaffoldId;
  }
}

export class PartialFileOutputError extends Error {
  readonly chatId: string;
  readonly scaffoldId: string | null;
  readonly issues: string[];

  constructor(chatId: string, scaffoldId: string | null, issues: string[]) {
    super("Generation produced partial file output");
    this.name = "PartialFileOutputError";
    this.chatId = chatId;
    this.scaffoldId = scaffoldId;
    this.issues = issues;
  }
}
