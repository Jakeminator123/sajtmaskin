export function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming === previous) return previous;
  // Only swallow incoming as a duplicate tail when it is short enough to be
  // a plausible SSE repeat-token (e.g. duplicated punctuation, cursor token).
  // The previous threshold of <50 chars dropped legitimate short corrective
  // chunks like "no" / "not" when the prior text happened to end with the
  // same letters, silently truncating the stream.
  if (incoming.length <= 8 && previous.endsWith(incoming)) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;

  // v0 sometimes sends full accumulated text (not just delta). If incoming
  // fully contains our previous text it's a safe full-replace.
  if (incoming.length > 64 && previous.length > 64 && incoming.includes(previous)) return incoming;
  // The reverse (previous includes incoming) means incoming is a subset we
  // already have -- only safe when previous is substantially longer.
  if (previous.length > 64 && previous.includes(incoming) && previous.length >= incoming.length) return previous;

  const MIN_SAFE_OVERLAP = 12;
  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size >= MIN_SAFE_OVERLAP; size -= 1) {
    if (previous.slice(-size) === incoming.slice(0, size)) {
      return previous + incoming.slice(size);
    }
  }

  // Large incoming that doesn't overlap -- likely a full-content replace from
  // v0 (the provider restarted its accumulation). Keep the longer text to
  // avoid truncating content that was already displayed.
  if (incoming.length > 200 && incoming.length > previous.length * 0.8) {
    return incoming.length >= previous.length ? incoming : previous;
  }

  const last = previous.slice(-1);
  const first = incoming[0];
  const needsSpace =
    last && first && /[.!?:;]$/.test(last) && /[A-Za-z0-9]/.test(first) && !/\s/.test(first);

  return needsSpace ? `${previous} ${incoming}` : previous + incoming;
}
