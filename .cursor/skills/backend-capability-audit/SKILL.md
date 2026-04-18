# Backend Capability Audit

Gör en komplett inventering av ALLA smarta funktioner i Sajtmaskin-backenden: API-routes, own-engine-pipelines, agents, verifier/autofix, preview/VM, deploy, media-hantering, brief-pipelines, scraping, env-policy. Målet är en läsbar katalog som senare kan användas för att exponera funktionerna i UI (se `backend-surface-mapping`).

**Trigger:** Användaren säger "backend audit", "kapabilitetsinventering", "skill backend capability" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent inventerar sin del av backenden, läser relevanta filer, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 50 rader. Format per upptäckt funktion:
  `- [KATEGORI] Namn — vad den gör (1 rad) — fil:rad — redan exponerad i UI? (JA/NEJ/DELVIS) — värde för användaren 1–5`
- Perspektiv: "Varje liten funktion som bara LLM:en eller interna kodvägar använder idag kan vara en Apple-enkel feature för användaren imorgon — om den hittas."
- Läs README:er lokalt (`src/lib/gen/README*`, `preview-host/`, `docs/architecture/*`) först för att inte missa saker.
- Kod är source of truth. Referera alltid till filer och funktionsnamn, gissa aldrig.

## Subagenter

### Agent 1 — API-routes (`src/app/api/**`)
- **Fil:** `reviews/capability-01-api-routes.txt`
- **Scope:** Alla filer under `src/app/api/`.
- **Fokus:** Lista varje route, dess HTTP-metod, syfte, parametrar, om auth krävs, om den är dold för användaren. Fånga "v0"-routes, brief, deployments, scrape, preview, templates, feedback. Markera vilka som saknar UI-motsvarighet.

### Agent 2 — Own-engine pipelines (`src/lib/gen/**`, `src/lib/providers/own-engine/**`, `src/lib/own-engine/**`)
- **Fil:** `reviews/capability-02-own-engine.txt`
- **Scope:** Pipelines, finalize, verifier, autofix, scaffold-val, build-spec, stream.
- **Fokus:** Vilka orchestreringsteg finns? Vilka policies (deferExtraRoutes, shellPages, scaffolds)? Finns interna toggles som borde vara synliga? Lista "hidden superpowers" — t.ex. "tvinga om-generering med annan scaffold" eller "re-run autofix".

### Agent 3 — Preview & VM (`preview-host/`, `src/lib/gen/preview/`, `src/lib/builder/preview-session/`)
- **Fil:** `reviews/capability-03-preview-vm.txt`
- **Scope:** preview-sessions, VM-livscykel, HMR, error-capture, route-switching.
- **Fokus:** Vilka VM-operationer finns? Kan användaren idag: starta om VM, byta route, se live logs, få error trace, force-rebuild? Lista varje operation med tillgänglighet i UI.

### Agent 4 — Deploy & publish (`src/app/api/v0/deployments/route.ts`, `src/lib/deploy/`, `vercelDeploy*`, `project-env-resolver*`)
- **Fil:** `reviews/capability-04-deploy.txt`
- **Scope:** Deploy-pipeline, env-mapping, domain-koppling, rollback.
- **Fokus:** Finns koncept som preview-URL vs production-URL? Kan användaren rulla tillbaka? Kan en deploy avbrytas? Vad returneras som inte visas i UI (build logs, env-diff)?

### Agent 5 — Brief, promptassist, needs-analysis (`src/lib/builder/needs-analysis/*`, brief-routes, PromptAssist)
- **Fil:** `reviews/capability-05-brief-pipeline.txt`
- **Scope:** Wizard-brief, deep-brief, rewrite/polish, scraping-normalisering.
- **Fokus:** Vilka fält, heuristiker och normaliseringar körs innan LLM? Vad kunde användaren se/redigera (t.ex. "visa den faktiska briefen vi skickar") om det fanns UI? Lista exponeringsvärda fält.

### Agent 6 — Scraping & extern data (`src/lib/scrape/**`, wizard-scrape-action, stock-providers)
- **Fil:** `reviews/capability-06-scraping.txt`
- **Scope:** Hur vi hämtar innehåll från befintlig sajt, media providers (stock), fallback-logik.
- **Fokus:** Vilka fält kan vi extrahera idag men visar aldrig? Finns cache/TTL? Kan användaren be om "scrape again" eller "ignorera X"? Lista extraherade datapunkter och nuvarande synlighet.

### Agent 7 — Templates & scaffolds (`src/lib/gen/template-library/`, `src/lib/gen/scaffolds/`, `templates_v0/`)
- **Fil:** `reviews/capability-07-templates-scaffolds.txt`
- **Scope:** Scaffold-familjer, variant-val, template-library, legacy `v0`-katalog.
- **Fokus:** Vilka scaffolds finns egentligen? Vilka varianter per familj? Kan användaren se dessa som "starting points"? Vilken metadata (screenshot, beskrivning, lämplig för X) finns redan men visas inte?

### Agent 8 — Cross-cutting: env, feature-flags, logging, feedback
- **Fil:** `reviews/capability-08-cross-cutting.txt`
- **Scope:** `config/env-policy.json`, `src/lib/env.ts`, `FEATURES` i `src/lib/config.ts`, feedback-API:er, telemetry.
- **Fokus:** Vilka flags styr beteende? Vilka är redan lämpliga som "advanced toggles"? Vilka events loggas? Finns feedback-paths (thumbs up/down, reportbug) som saknar UI? Lista exakt och märk "safe to surface" vs "keep internal".
