export type FaqItemDraft = {
  question: string;
  answer: string;
};

type FaqItemMatch = {
  question: string;
  answer: string;
  questionRange: { start: number; end: number };
  answerRange: { start: number; end: number };
};

function isPageFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  return (
    normalized === "page.tsx" ||
    normalized.endsWith("/page.tsx") ||
    normalized === "pages/index.tsx" ||
    normalized.endsWith("/index.tsx")
  );
}

// Bounded captures ((?:(?!\N)[\s\S])*?): may not cross the closing quote, so a
// sibling object that has `question:` but no `answer:` cannot leak into the match.
const FAQ_ITEM_RE =
  /\{\s*question:\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1\s*,\s*answer:\s*(["'`])((?:\\[\s\S]|(?!\3)[^\\])*?)\3[\s\S]*?\}/g;

function findFaqItemMatches(content: string): FaqItemMatch[] {
  const matches: FaqItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = FAQ_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const question = match[2] ?? "";
    const answer = match[4] ?? "";
    const questionStartInMatch = full.indexOf(question);
    const answerStartInMatch = full.indexOf(answer, questionStartInMatch + question.length);
    if (questionStartInMatch === -1 || answerStartInMatch === -1) continue;

    matches.push({
      question,
      answer,
      questionRange: {
        start: match.index + questionStartInMatch,
        end: match.index + questionStartInMatch + question.length,
      },
      answerRange: {
        start: match.index + answerStartInMatch,
        end: match.index + answerStartInMatch + answer.length,
      },
    });
  }

  return matches;
}

function replaceRanges(
  content: string,
  replacements: Array<{ start: number; end: number; value: string }>,
): string {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce(
      (next, replacement) =>
        `${next.slice(0, replacement.start)}${replacement.value}${next.slice(replacement.end)}`,
      content,
    );
}

export function readFaqItemsDraft(
  fileName: string,
  content: string,
): FaqItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findFaqItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 10).map((match) => ({
    question: match.question,
    answer: match.answer,
  }));
}

export function updateFaqItemsDraft(
  content: string,
  nextItems: FaqItemDraft[],
): string {
  const matches = findFaqItemMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem) return;
    if (nextItem.question !== match.question) {
      replacements.push({
        start: match.questionRange.start,
        end: match.questionRange.end,
        value: nextItem.question,
      });
    }
    if (nextItem.answer !== match.answer) {
      replacements.push({
        start: match.answerRange.start,
        end: match.answerRange.end,
        value: nextItem.answer,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
