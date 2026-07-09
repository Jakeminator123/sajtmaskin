import type { InferredCapabilities } from "./capability-inference";

type CapabilityDossierBridgeEntry = {
  flag: keyof InferredCapabilities;
  dossierCapabilities: readonly string[];
};

export const INFERRED_CAPABILITY_DOSSIER_BRIDGE = [
  { flag: "needs3D", dossierCapabilities: ["visual-3d"] },
  { flag: "needsPhysics", dossierCapabilities: ["physics-3d"] },
  { flag: "needsParallax", dossierCapabilities: ["parallax-scroll", "parallax-pointer"] },
  { flag: "needsPayments", dossierCapabilities: ["payments"] },
  // #475 split follow-up (review round 2): recurring/subscription vocabulary
  // routes to `subscriptions` (paddle-billing) — via needsPayments it injected
  // Stripe one-off checkout for a recurring ask. `subscriptions` in turn pulls
  // `supabase-auth` via expandDependentCapabilities in selection.
  { flag: "needsSubscriptions", dossierCapabilities: ["subscriptions"] },
  { flag: "needsAuth", dossierCapabilities: ["auth"] },
  // Codex P1 (#445): without this bridge a no-brief init ("booking app that
  // saves bookings in Postgres") sets needsDatabase but selects no database
  // dossier at all — unlike the auth/payments fallback path.
  { flag: "needsDatabase", dossierCapabilities: ["database"] },
  { flag: "needsForms", dossierCapabilities: ["contact-form"] },
  { flag: "needsCarousel", dossierCapabilities: ["carousel"] },
  { flag: "needsCommandSearch", dossierCapabilities: ["command-search"] },
  // `needsGame` is distinct from `needs3D` / `needsPhysics` — a game requires
  // state + loop + controls + collision + score + restart, not just
  // decorative motion or rigid bodies. When the prompt is both a game AND
  // asks for WebGL/physics, all three capabilities light up simultaneously
  // so the codegen LLM sees the compact Game contract + the ThreeCanvasShell
  // verbatim file + the physics guidance without competing instructions.
  { flag: "needsGame", dossierCapabilities: ["interactive-game"] },
] as const satisfies readonly CapabilityDossierBridgeEntry[];

export function resolveDossierCapabilitiesFromInferredCapabilities(
  capabilities: InferredCapabilities,
): string[] {
  const dossierCapabilities: string[] = [];

  for (const entry of INFERRED_CAPABILITY_DOSSIER_BRIDGE) {
    if (capabilities[entry.flag]) {
      dossierCapabilities.push(...entry.dossierCapabilities);
    }
  }

  return dossierCapabilities;
}
