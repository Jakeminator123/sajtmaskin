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
  { flag: "needsAuth", dossierCapabilities: ["auth"] },
  { flag: "needsForms", dossierCapabilities: ["contact-form"] },
  { flag: "needsCarousel", dossierCapabilities: ["carousel"] },
  { flag: "needsCommandSearch", dossierCapabilities: ["command-search"] },
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
