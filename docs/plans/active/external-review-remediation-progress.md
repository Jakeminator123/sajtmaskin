# External review remediation — progress

Source material: `.j_to_agent/1.txt` (landing + integrationer), `2.txt` (own-engine pack), `3.txt` (scaffolds, scripts, orchestrator).

Last code touch: Tier-2 våg — UTF-8-literaler i `landing-chat-data.ts`; ny `src/lib/integrations/registry.ts` (scaffold, ej kopplad till `detect-integrations` än).

**Siffror:** **~24%** = ungefärlig andel av *hela* externreview + migrationer (tre dokument). **~58%** = bara *landnings-spåret* (del av `1.txt`), inte hela projektet.

## Commit- och push-rutin (pågående körning)

Vid varje dokumenterad avstämning:

1. Uppdatera tabellen **Overall fill** / **Done** om något nytt levererats.
2. `git add` endast reporelevanta filer (inte lokala `.cursor/run`, `data/`, `logs/`, `.j_to_agent/` om de inte ska in).
3. **Commit-rad:** använd **helhets-%** (Whole vision), t.ex. `chore: remediation ~24pct — kort vad som ändrats`.
4. Valfritt i **commit body:** landnings-% eller spår (integrationer, own-engine) om det hjälper historiken.
5. `git push` till `master` (eller din arbetsbranch).

## Overall fill (approximate)

| Segment | Done | Remaining |
|--------|------|-----------|
| **Whole vision** (alla tre dokument + stora migrationer) | **~27%** | **~73%** |
| **Landing slice** (steg 1–4 i `1.txt`, delvis) | **~62%** | **~38%** |
| **Integrationer + deploy** (`1.txt` steg 5–7) | **~8%** | **~92%** |
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
- `integrationRegistry` + typer i `src/lib/integrations/registry.ts` (nästa: koppla `detect-integrations` / UI hit).

## Next (recommended order)

1. Bryt ut JSX-sektioner från `chat-area.tsx` till `LandingHero`, `LandingFooter`, m.m. (`1.txt` — kvar efter controller).
2. `LandingBackground` semantiskt per läge; färre samtidiga effekter; mer reduced-motion / in-view för 3D.
3. Växla `detect-integrations` + ev. wizard/panel till att läsa från `integrationRegistry`; manifest + tunnare deploy (`1.txt`).
4. Own-engine remediation (`2.txt`).
5. Scripts-städ (`hamta_sidor*`, lab-mappar, README-drift) (`3.txt`).

## Uncertainties / product follow-ups

- Footer “Om oss” / “Blogg” pekar på `/faq` tills dedikerade sidor finns.
- Social copy ersätter länkar tills URL:er finns.
- `IntegrationCard` har kvar CSS `float`-animationer (ej reduced-motion ännu).
