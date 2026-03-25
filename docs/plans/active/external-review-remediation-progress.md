# External review remediation — progress

Source material: `.j_to_agent/1.txt` (landing + integrationer), `2.txt` (own-engine pack), `3.txt` (scaffolds, scripts, orchestrator). **Agent-uppdelning:** `docs/plans/active/orchestrator-workloads-external-review.md`.

Last code touch: `LandingBackground` utbruten från `chat-area.tsx` (semantisk `data-landing-bg` + reduced-motion i `landing-v2.css`).

**Siffror:** **~34%** = ungefärlig andel av *hela* externreview + migrationer (tre dokument). **~72%** = bara *landnings-spåret* (del av `1.txt`), inte hela projektet.

## Commit- och push-rutin (pågående körning)

Vid varje dokumenterad avstämning:

1. Uppdatera tabellen **Overall fill** / **Done** om något nytt levererats.
2. `git add` endast reporelevanta filer (inte lokala `.cursor/run`, `data/`, `logs/`, `.j_to_agent/` om de inte ska in).
3. **Commit-rad:** använd **helhets-%** (Whole vision), t.ex. `chore: remediation ~34pct — kort vad som ändrats`.
4. Valfritt i **commit body:** landnings-% eller spår (integrationer, own-engine) om det hjälper historiken.
5. `git push` till `master` (eller din arbetsbranch).

## Overall fill (approximate)

| Segment | Done | Remaining |
|--------|------|-----------|
| **Whole vision** (alla tre dokument + stora migrationer) | **~34%** | **~66%** |
| **Landing slice** (steg 1–4 i `1.txt`, delvis) | **~72%** | **~28%** |
| **Integrationer + deploy** (`1.txt` steg 5–7) | **~22%** | **~78%** |
| **Own-engine** (`2.txt`) | **~0%** | **~100%** |
| **Scripts / naming hygiene** (`3.txt`) | **~0%** | **~100%** |

## Done (in repo)

- Landning: statisk copy/data i `landing-chat-data.ts`; delade hooks i `landing-hooks.ts`; state/build-flöde i `useLandingController` (`use-landing-controller.ts`).
- 3D tilt + tech/integration card glow + terminal glow: DOM / CSS-variabler, inte `setState` per rörelse.
- `prefers-reduced-motion` stoppar tilt-uppdateringar.
- Tech stack: Drizzle ORM, Vercel Analytics (stämmer med `@vercel/analytics` + Speed Insights i `src/app/layout.tsx`).
- Integrationer-rad: OpenAI; Sentry bort från listan.
- Zod-feature copy: Drizzle / server actions / API.
- Footer: `/privacy`, `/terms`, `/faq`, `mailto:`; inga falska social-URL:er.
- Video-knapp: väljer Analyserad + toast.
- `integrationRegistry` + typer; `detectIntegrations()` läser namn/envVars/setupGuide därifrån via `DETECTION_PIPELINE` (regex kvar i `detect-integrations.ts`).
- `scripts/run-eval.ts` needle-checks uppdaterade (registry + pipeline).
- `landing-hero.tsx` / `landing-footer.tsx`: hero + footer JSX bort från monolitiska `chat-area.tsx`.
- `extract-landing-chat-data.mjs`: avbryter om monolit-block saknas (förhindrar att gamla radnummer skriver sönder `landing-chat-data.ts`).
- `write-tier2-run.mjs`: valfritt run-id som CLI-arg (`node scripts/write-tier2-run.mjs <id>`).
- `chat-area.tsx`: borttagna oanvända Lucide-/data-imports; oanvända värden från `useLandingController` plockas inte längre ut; terminal ref-merge med tydlig eslint-avsiktskommentar.
- `landing-hero.tsx`: `headlineTilt` destruktureras så `eslint-plugin-react-hooks` ref-regler inte falskt larmar.
- `landing-background.tsx`: shader-orbs + grid + noise flyttade från `ChatArea`; `data-landing-bg` per kategori (`fritext`, `template`, `audit`, `analyserad`); `prefers-reduced-motion` via scoped CSS under `.landing-chat-bg` (lägre opacitet, inga orb-/grid-animationer).

## Next (recommended order)

1. ~~`LandingBackground` (shader/grid/noise) till egen komponent; semantiskt per läge; reduced-motion / in-view för 3D.~~ **Klart** (in-view för övrig 3D kvar vid behov).
2. Utöka `integrationRegistry` med fler providers (Clerk, GA, …) eller manifest vid generering; tunnare deploy (`1.txt`).
3. Own-engine remediation (`2.txt`).
4. Scripts-städ (`hamta_sidor*`, lab-mappar, README-drift) (`3.txt`).

## Uncertainties / product follow-ups

- Footer “Om oss” / “Blogg” pekar på `/faq` tills dedikerade sidor finns.
- Social copy ersätter länkar tills URL:er finns.
- `IntegrationCard` har kvar CSS `float`-animationer (ej reduced-motion ännu).
