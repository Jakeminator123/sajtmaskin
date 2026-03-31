/**
 * Types for TransformStream-based post-processing of LLM output (line rules).
 * Rule implementations live alongside stream setup; this module keeps the
 * shared contract for `route-helpers` and future suspense wiring.
 */

export interface StreamContext {
  /** Mapping from alias key (e.g. "MEDIA_1", "URL_2") to full URL. */
  urlMap?: Record<string, string>;
}

export interface SuspenseRule {
  name: string;
  /**
   * Transform a single complete line. Return the line unchanged if the
   * rule does not apply. Must not throw — swallow errors and return
   * the original line to avoid corrupting the stream.
   */
  transform(line: string, context: StreamContext): string;
}
