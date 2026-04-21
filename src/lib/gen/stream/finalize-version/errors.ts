/**
 * Error classes thrown from the finalize pipeline.
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 * Re-exported from the main module so existing `instanceof` imports stay
 * backward-compatible.
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
