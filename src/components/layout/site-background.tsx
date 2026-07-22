/**
 * SiteBackground — lätt, WebGL-fri sidbakgrund.
 *
 * Återanvänder samma CSS-orbs som förstasidan (`landing-background.tsx` +
 * `styles/landing-v2.css`) men utan controller-beroende och utan den tunga
 * `@paper-design/shaders-react`-Dithering-shadern (`shader-background.tsx`).
 * Ger visuell konsekvens med förstasidan till en bråkdel av laddningskostnaden.
 *
 * Används på /teknik och i templates-flödet (/templates + /category/[type]).
 * Kan senare migrera in fler sidor (projects/buy-credits/audits/admin).
 */

const NOISE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`

/** Semantisk tint (samma nycklar som landing-background). Default = lugn "fritext". */
export type SiteBackgroundTint = "fritext" | "template" | "audit" | "analyserad"

export function SiteBackground({ tint = "fritext" }: { tint?: SiteBackgroundTint } = {}) {
  return (
    <div className="landing-chat-bg pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 overflow-hidden" data-landing-bg={tint}>
        <div className="shader-orb shader-orb-1" />
        <div className="shader-orb shader-orb-2" />
        <div className="shader-orb shader-orb-3" />
      </div>
      <div className="landing-chat-bg-grid absolute inset-0 opacity-[0.035] grid-background" />
      <div
        className="landing-chat-bg-noise absolute inset-0 opacity-[0.02] mix-blend-soft-light pointer-events-none"
        style={{ backgroundImage: NOISE_BG }}
      />
    </div>
  )
}
