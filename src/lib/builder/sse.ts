type SseData = unknown;

function parseSseData(raw: string): SseData {
  const trimmed = String(raw ?? "");
  if (!trimmed) return "";
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function consumeSseResponse(
  response: Response,
  onEvent: (event: string, data: SseData, raw: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
        continue;
      }
      if (line.startsWith("data: ") && currentEvent) {
        const raw = line.slice(6);
        const data = parseSseData(raw);
        onEvent(currentEvent, data, raw);
        currentEvent = "";
      }
    }
  }
}
