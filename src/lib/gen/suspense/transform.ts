/**
 * TransformStream-based post-processing layer for LLM-generated code.
 *
 * Manipulates text DURING streaming so the client never sees broken
 * intermediate states (sajtmaskin's equivalent of v0's "LLM Suspense").
 *
 * Works on TEXT chunks (strings), not bytes. Sits between the AI
 * response and the SSE encoder in the route handler.
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

/**
 * Creates a TransformStream that buffers text until complete lines
 * exist, runs every rule on each line, then forwards processed lines.
 *
 * Regex patterns inside rules use non-global variants or are freshly
 * created per call to avoid stateful lastIndex issues.
 */
export function createSuspenseTransform(
  rules: SuspenseRule[],
  context: StreamContext = {},
): TransformStream<string, string> {
  let buffer = "";

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      const lines = buffer.split("\n");
      // Last element is either empty (if chunk ended with \n) or an
      // incomplete line — keep it in the buffer for the next chunk.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        controller.enqueue(applyRules(line, rules, context) + "\n");
      }
    },

    flush(controller) {
      if (buffer) {
        controller.enqueue(applyRules(buffer, rules, context));
      }
    },
  });
}

function applyRules(
  line: string,
  rules: SuspenseRule[],
  context: StreamContext,
): string {
  let result = line;
  for (const rule of rules) {
    try {
      result = rule.transform(result, context);
    } catch {
      // Rule failed — pass through unchanged to avoid corrupting stream.
    }
  }
  return result;
}
