import type { Metadata } from "next";

import StudioHome from "@viewser/studio-page";
import { StudioShell } from "@viewser/studio-shell";

// Operator console — ported from Sajtbyggaren's (console) studio. Rendered
// directly (no nested layout) to avoid Next's typed-routes LayoutProps quirk;
// the client shell applies the warm theme + toast/token-meter providers.
export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return (
    <StudioShell>
      <StudioHome />
    </StudioShell>
  );
}
