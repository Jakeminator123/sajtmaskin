type SseData = unknown;

function parseSseData(raw: string): SseData {
  const trimmed = String(raw ?? "");
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function consumeSseResponse(
  response: Response,
  onEvent: (event: string, data: SseData, raw: string) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const signal = options?.signal;
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (!currentEvent || dataLines.length === 0) {
      dataLines = [];
      return;
    }
    const raw = dataLines.join("\n");
    const data = parseSseData(raw);
    onEvent(currentEvent, data, raw);
    currentEvent = "";
    dataLines = [];
  };

  try {
  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line) {
        flushEvent();
        continue;
      }
      if (line.startsWith("event:")) {
        flushEvent();
        currentEvent = line.slice(6).trimStart();
        continue;
      }
      if (line.startsWith("data:")) {
        const raw = line.slice(5);
        const normalized = raw.startsWith(" ") ? raw.slice(1) : raw;
        const cleaned = normalized.endsWith("\r") ? normalized.slice(0, -1) : normalized;
        dataLines.push(cleaned);
      }
    }
  }

  flushEvent();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader may already be released
    }
  }
}
