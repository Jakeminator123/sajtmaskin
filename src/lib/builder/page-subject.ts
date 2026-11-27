// In "a page about owls", "about" introduces the subject. "About us" is a named page.
const PAGE_SUBJECT_INTRO =
  /(?<![\p{L}\p{N}_])(?:hemsida|webbsida|webbplats|sida|sajt|website|web\s+page|page|site|app)\s+(?:om|about)\s+(?!(?:oss|us)(?![\p{L}\p{N}_]))(?=[\p{L}\p{N}])/giu;

export function withoutPageSubjectIntro(prompt: string): string {
  return prompt.replace(PAGE_SUBJECT_INTRO, " ");
}
