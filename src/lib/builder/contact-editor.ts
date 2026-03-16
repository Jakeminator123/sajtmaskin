export type ContactDetailsDraft = {
  email: string;
  phone: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAll(content: string, searchValue: string, replaceValue: string): string {
  if (!searchValue || searchValue === replaceValue) return content;
  return content.replace(new RegExp(escapeRegExp(searchValue), "g"), replaceValue);
}

export function readContactDetailsDraft(content: string): ContactDetailsDraft | null {
  const emailMatch = content.match(/mailto:([^"'`\s>}]+)/i);
  const phoneMatch = content.match(/tel:([^"'`\s>}]+)/i);
  const email = emailMatch?.[1] ?? "";
  const phone = phoneMatch?.[1] ?? "";

  if (!email && !phone) return null;

  return { email, phone };
}

export function updateContactDetailsDraft(
  content: string,
  previousDraft: ContactDetailsDraft,
  nextDraft: ContactDetailsDraft,
): string {
  let next = content;

  if (previousDraft.email && previousDraft.email !== nextDraft.email) {
    next = replaceAll(next, `mailto:${previousDraft.email}`, `mailto:${nextDraft.email}`);
    next = replaceAll(next, previousDraft.email, nextDraft.email);
  }

  if (previousDraft.phone && previousDraft.phone !== nextDraft.phone) {
    next = replaceAll(next, `tel:${previousDraft.phone}`, `tel:${nextDraft.phone}`);
    next = replaceAll(next, previousDraft.phone, nextDraft.phone);
  }

  return next;
}
