/**
 * Swedish portal copy for site address and publish state.
 *
 * Kept out of the components so the wording is testable and so the same state
 * cannot be described one way on the project card and another way in the site
 * view. The copy is deliberately honest about the provider fallback: a
 * `*.vercel.app` host is a temporary technical address, and calling it "din
 * adress" would tell the customer something untrue about their own site.
 */

import type { SiteAddressKind, SitePublishState } from "./project-client";

export type SiteStateTone = "live" | "progress" | "problem" | "idle";

export type SiteStateLabel = {
  label: string;
  tone: SiteStateTone;
};

export function publishStateLabel(state: SitePublishState): SiteStateLabel {
  switch (state) {
    case "ready":
      return { label: "Publicerad", tone: "live" };
    case "building":
      return { label: "Bygger", tone: "progress" };
    case "pending":
      return { label: "Väntar", tone: "progress" };
    case "error":
      return { label: "Publiceringen misslyckades", tone: "problem" };
    case "cancelled":
      return { label: "Publiceringen avbröts", tone: "problem" };
    case "never_published":
      return { label: "Inte publicerad", tone: "idle" };
  }
}

export function addressKindLabel(kind: SiteAddressKind): string {
  switch (kind) {
    case "custom":
      return "Din egen domän";
    case "branded":
      return "Din Sajtmaskin-adress";
    case "provider":
      return "Teknisk adress";
    case "none":
      return "Ingen adress än";
  }
}

/**
 * Explanation shown under the address. The `provider` case is the reason this
 * function exists — the customer needs to know the address is temporary and
 * what makes it permanent.
 */
export function addressKindHelp(kind: SiteAddressKind): string | null {
  switch (kind) {
    case "custom":
      return null;
    case "branded":
      return "Koppla en egen domän när du vill — din Sajtmaskin-adress fortsätter fungera.";
    case "provider":
      return "Sajten ligger på en teknisk adress från hostingleverantören. Den är inte tänkt att delas — en Sajtmaskin-adress eller egen domän är nästa steg.";
    case "none":
      return "Publicera sajten för att få en adress.";
  }
}
