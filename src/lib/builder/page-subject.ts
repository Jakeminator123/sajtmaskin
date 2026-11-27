// A page about a subject describes content. An app about an activity can
// describe any product, so leave it to the regular App resolver.
const PAGE_SUBJECT_INTRO =
  /(?<![\p{L}\p{N}_])(?:hemsida|webbsida|webbplats|sida|sajt|website|web\s*page|page|site)\s+(?:om|about)\s+(?!(?:oss|us)(?![\p{L}\p{N}_]))(?=[\p{L}\p{N}])/iu;
const SUBJECT_END =
  /[.!?;,+\n]|\s+(?:med|with|utan|without|inklusive|including|via|using|där|where|som|that|which|och\s+(?:en|ett|lägg|ska|visa|bygg)|and\s+(?:an?|add|include|show|build))\s+/iu;

/** Text outside the stated topic; null if the prompt names no page subject. */
export function outsidePageSubject(prompt: string): string | null {
  const intro = PAGE_SUBJECT_INTRO.exec(prompt);
  if (!intro) return null;
  const tail = prompt.slice(intro.index + intro[0].length);
  const end = tail.search(SUBJECT_END);
  return prompt.slice(0, intro.index) + (end < 0 ? "" : tail.slice(end));
}
