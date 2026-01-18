export function looksLikeV0ChatId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,}$/.test(id);
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const THINKING_KEYS = new Set(["thinking", "reasoning", "thought"]);

function collectStrings(
  value: unknown,
  acc: string[],
  options?: { skipKeys?: Set<string> }
): void {
  if (typeof value === "string") {
    acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, acc, options));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    if (options?.skipKeys?.has(key)) continue;
    collectStrings(next, acc, options);
  }
}

function collectKeyedStrings(
  value: unknown,
  keys: Set<string>,
  acc: string[]
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeyedStrings(item, keys, acc));
    return;
  }
  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key)) {
      collectStrings(next, acc);
    } else {
      collectKeyedStrings(next, keys, acc);
    }
  }
}

export function extractChatId(parsed: unknown, currentEvent?: string): string | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as any;
  const explicitCandidates = [obj.chatId, obj.chat_id, obj.chat?.id];
  for (const c of explicitCandidates) {
    if (looksLikeV0ChatId(c)) return c;
  }

  if (looksLikeV0ChatId(obj.id)) {
    const eventHint = (currentEvent || '').toLowerCase();
    const hasChatHints =
      eventHint.includes('chat') ||
      typeof obj.webUrl === 'string' ||
      typeof obj.url === 'string' ||
      typeof obj.projectId === 'string' ||
      typeof obj.project_id === 'string' ||
      typeof obj.chatPrivacy === 'string' ||
      typeof obj.chat_privacy === 'string' ||
      typeof obj.privacy === 'string' ||
      typeof obj.shareable === 'boolean' ||
      typeof obj.title === 'string' ||
      typeof obj.modelId === 'string' ||
      typeof obj.model_id === 'string' ||
      typeof obj.modelConfiguration === 'object' ||
      typeof obj.latestVersion === 'object' ||
      obj.object === 'chat';

    if (hasChatHints) return obj.id;
  }

  return null;
}

export function extractDemoUrl(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  const direct =
    obj.demoUrl ||
    obj.demo_url ||
    obj.latestVersion?.demoUrl ||
    obj.latestVersion?.demo_url ||
    null;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested: string[] = [];
  collectKeyedStrings(obj, new Set(["demoUrl", "demo_url"]), nested);
  const found = nested.join("");
  return found ? found : null;
}

export function extractVersionId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  const direct =
    obj.versionId || obj.version_id || obj.latestVersion?.id || obj.latestVersion?.versionId || null;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested: string[] = [];
  collectKeyedStrings(obj, new Set(["versionId", "version_id"]), nested);
  const found = nested.join("");
  return found ? found : null;
}

export function extractMessageId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  const explicit =
    obj.messageId || obj.message_id || obj.latestVersion?.messageId || obj.message?.id || null;
  if (typeof explicit === 'string' && explicit.trim()) return explicit;

  if (typeof obj.object === 'string' && obj.object.startsWith('message')) {
    if (typeof obj.id === 'string' && obj.id.trim()) return obj.id;
  }

  return null;
}

export function extractThinkingText(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  if (typeof obj.thinking === 'string') return obj.thinking;
  if (typeof obj.reasoning === 'string') return obj.reasoning;
  const nested: string[] = [];
  collectKeyedStrings(obj, THINKING_KEYS, nested);
  const found = nested.join("");
  return found ? found : null;
}

export function extractContentText(parsed: unknown, _raw: string): string | null {
  if (typeof parsed === 'string') return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.delta === 'string') return obj.delta;
  if (typeof obj.delta !== 'undefined') {
    const deltaStrings: string[] = [];
    collectStrings(obj.delta, deltaStrings, { skipKeys: THINKING_KEYS });
    const joined = deltaStrings.join('');
    if (joined) return joined;
  }
  return null;
}

export function isDoneLikeEvent(currentEvent: string, parsed: unknown): boolean {
  const evt = (currentEvent || '').toLowerCase();
  if (evt.includes('done') || evt.includes('complete')) return true;

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as any;
    return Boolean(obj.done || obj.completed);
  }

  return false;
}
