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
  return (
    obj.demoUrl ||
    obj.demo_url ||
    obj.latestVersion?.demoUrl ||
    obj.latestVersion?.demo_url ||
    null
  );
}

export function extractVersionId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  return (
    obj.versionId || obj.version_id || obj.latestVersion?.id || obj.latestVersion?.versionId || null
  );
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
  return null;
}

export function extractContentText(parsed: unknown, _raw: string): string | null {
  if (typeof parsed === 'string') return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as any;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.delta === 'string') return obj.delta;
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
