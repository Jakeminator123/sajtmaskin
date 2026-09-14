/**
 * Presentation helpers for the customer account page.
 *
 * Login method is derived from `users.provider` (email | google). The page
 * must not invent a subscription, plan, or invoice — those do not exist yet.
 */

export function loginMethodLabel(provider: string | null | undefined): string {
  if (provider === "google") return "Google";
  return "E-post och lösenord";
}

export function transactionLabel(input: {
  description: string | null | undefined;
  type: string;
}): string {
  const description = input.description?.trim();
  if (description) return description;
  if (input.type === "purchase") return "Köp av credits";
  return input.type;
}
