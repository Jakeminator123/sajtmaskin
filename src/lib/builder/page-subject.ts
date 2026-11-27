// A page about a subject describes content. An app about an activity can
// describe any product, so leave it to the regular App resolver.
const PAGE_SUBJECT_INTRO =
  /(?<![\p{L}\p{N}_])(?:hemsida|webbsida|webbplats|(?:informations)?(?:sida|sajt)|website|web\s*page|page|site)\s+(?:om|about)\s+(?!(?:oss|us)(?![\p{L}\p{N}_]))(?=[\p{L}\p{N}])/iu;
const SUBJECT_END =
  /[.!?;,+\n]|\s+(?:med|with|utan|without|inklusive|including|featuring|to\s+include|via|using|där|where|som|that|which|och\s+(?:en|ett|lägg|ska|visa|bygg)|and\s+(?:an?|add|include|show|build))\s+/iu;

/** Parts of the first content-page subject and its surrounding instructions. */
export function splitPageSubject(prompt: string) {
  const intro = PAGE_SUBJECT_INTRO.exec(prompt);
  if (!intro) return null;
  const tail = prompt.slice(intro.index + intro[0].length);
  const end = tail.search(SUBJECT_END);
  return {
    before: prompt.slice(0, intro.index),
    subject: end < 0 ? tail : tail.slice(0, end),
    after: end < 0 ? "" : tail.slice(end),
  };
}

/** Text outside stated topics; null if the prompt names no page subject. */
export function outsidePageSubject(prompt: string): string | null {
  let subject = splitPageSubject(prompt);
  if (!subject) return null;
  let outside = "";
  let remaining = prompt;
  while (subject) {
    outside += subject.before;
    remaining = subject.after;
    subject = splitPageSubject(remaining);
  }
  return outside + remaining;
}
