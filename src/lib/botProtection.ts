export function getBotScore(req: Request): { score: number | null; type: string | null } {
  const scoreHeader = req.headers.get('x-vercel-bot-score');
  const type = req.headers.get('x-vercel-bot-type');
  const score = scoreHeader ? Number.parseInt(scoreHeader, 10) : null;

  return {
    score: Number.isFinite(score as number) ? score : null,
    type,
  };
}

export function isLikelyBot(req: Request, threshold: number = 90): boolean {
  const { score } = getBotScore(req);
  if (typeof score !== 'number') return false;
  return score >= threshold;
}

export function requireNotBot(req: Request, opts?: { threshold?: number }): Response | null {
  const threshold = typeof opts?.threshold === 'number' ? opts.threshold : 90;
  if (!isLikelyBot(req, threshold)) return null;

  return new Response(JSON.stringify({ error: 'Request blocked (bot suspected)' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
