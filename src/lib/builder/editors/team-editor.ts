export type TeamMemberDraft = {
  name: string;
  role: string;
  bio: string;
};

type TeamMemberMatch = {
  name: string;
  role: string;
  bio: string;
  nameRange: { start: number; end: number };
  roleRange: { start: number; end: number };
  bioRange: { start: number; end: number };
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
// sibling object that starts with `name:` but lacks `role:`/`bio:` cannot leak in.
const TEAM_MEMBER_OBJECT_RE =
  /\{\s*name:\s*(["'`])((?:(?!\1)[\s\S])*?)\1\s*,\s*role:\s*(["'`])((?:(?!\3)[\s\S])*?)\3\s*,\s*bio:\s*(["'`])((?:(?!\5)[\s\S])*?)\5[\s\S]*?\}/g;

const TEAM_MEMBER_HTML_RE =
  /<(h3|h4|strong)\b[^>]*>([^<]+)<\/\1>\s*<(?:p|span)\b[^>]*>([^<]+)<\/(?:p|span)>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;

function findTeamMemberObjectMatches(content: string): TeamMemberMatch[] {
  const matches: TeamMemberMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = TEAM_MEMBER_OBJECT_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[2] ?? "";
    const role = match[4] ?? "";
    const bio = match[6] ?? "";
    const nameStartInMatch = full.indexOf(name);
    const roleStartInMatch = full.indexOf(role, nameStartInMatch + name.length);
    const bioStartInMatch = full.indexOf(bio, roleStartInMatch + role.length);
    if (nameStartInMatch === -1 || roleStartInMatch === -1 || bioStartInMatch === -1) continue;

    matches.push({
      name,
      role,
      bio,
      nameRange: {
        start: match.index + nameStartInMatch,
        end: match.index + nameStartInMatch + name.length,
      },
      roleRange: {
        start: match.index + roleStartInMatch,
        end: match.index + roleStartInMatch + role.length,
      },
      bioRange: {
        start: match.index + bioStartInMatch,
        end: match.index + bioStartInMatch + bio.length,
      },
    });
  }

  return matches;
}

function findTeamMemberHtmlMatches(content: string): TeamMemberMatch[] {
  const matches: TeamMemberMatch[] = [];
  const teamHint = /(?:class|className)=[^>]*team/i.test(content);

  let match: RegExpExecArray | null;
  while ((match = TEAM_MEMBER_HTML_RE.exec(content)) !== null) {
    const name = (match[2] ?? "").trim();
    const role = (match[3] ?? "").trim();
    const bio = (match[4] ?? "").trim();
    if (!name || !bio) continue;
    if (!teamHint && matches.length === 0) continue;

    const nameStart = match.index + match[0].indexOf(match[2]);
    const roleStart = match.index + match[0].indexOf(match[3]);
    const bioStart = match.index + match[0].indexOf(match[4]);

    matches.push({
      name,
      role,
      bio,
      nameRange: { start: nameStart, end: nameStart + name.length },
      roleRange: { start: roleStart, end: roleStart + role.length },
      bioRange: { start: bioStart, end: bioStart + bio.length },
    });
  }

  return matches;
}

function findTeamMemberMatches(content: string): TeamMemberMatch[] {
  const objectMatches = findTeamMemberObjectMatches(content);
  if (objectMatches.length >= 1) return objectMatches;

  const htmlMatches = findTeamMemberHtmlMatches(content);
  if (htmlMatches.length >= 1) return htmlMatches;

  return [];
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

export function readTeamMembers(
  fileName: string,
  content: string,
): TeamMemberDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findTeamMemberMatches(content);
  if (matches.length === 0) return null;
  return matches.slice(0, 12).map((m) => ({ name: m.name, role: m.role, bio: m.bio }));
}

export function updateTeamMembersDraft(
  content: string,
  _previousMembers: TeamMemberDraft[],
  nextMembers: TeamMemberDraft[],
): string {
  const matches = findTeamMemberMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextMembers.length).forEach((match, index) => {
    const nextItem = nextMembers[index];
    if (!nextItem) return;
    if (nextItem.name !== match.name) {
      replacements.push({
        start: match.nameRange.start,
        end: match.nameRange.end,
        value: nextItem.name,
      });
    }
    if (nextItem.role !== match.role) {
      replacements.push({
        start: match.roleRange.start,
        end: match.roleRange.end,
        value: nextItem.role,
      });
    }
    if (nextItem.bio !== match.bio) {
      replacements.push({
        start: match.bioRange.start,
        end: match.bioRange.end,
        value: nextItem.bio,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
