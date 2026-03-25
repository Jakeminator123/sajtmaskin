# Arkiverad kritik — ~18pct (`ceaee87b`)

**Ursprung:** parallell granskning av första landnings-remedieringen.  
**Raducerad:** sammanfattning efter att senare commits åtgärdat det mesta.

## Vad rapporten sa (kort)

| Punkt | Utfall på senare `master` |
|--------|---------------------------|
| Mousemove → ingen `setState` för tilt/glow/terminal | **Kvar** (18pct + `landing-hooks.ts`) |
| `prefers-reduced-motion` för tilt | **Kvar**; bakgrundslager fick egen reduced-motion i ~34pct (`landing-v2.css` under `.landing-chat-bg`) |
| Tech stack vs `package.json` (Drizzle, Vercel Analytics, m.m.) | **Kvar** |
| Footer utan `href="#"`; video → Analyserad + toast; Zod-rad | **Kvar** |
| Reduced motion för *alla* animationer (t.ex. `IntegrationCard` float) | **Delvis öppet** — fortfarande i progress *Uncertainties* |
| Footer: GDPR/cookies → bara `/privacy`; "Om oss"/"Blogg" → `/faq` | **Delvis öppet** (produkt/juridik) |
| `chat-area` uppdelning, semantisk bakgrund, 3D bara in-view | **Delvis gjort** — controller, hero/footer, `LandingBackground` + tints; in-view för övrig 3D enligt plan kvar |

## Vad du ska läsa i stället för detaljerna här

- `docs/plans/active/external-review-remediation-progress.md` (aktuella % och *Next*).
- Nyare kritik: `31pct-t.md`, `34pct-n.md` (om den finns i worktree/commit).

## Nytt material sedan ~31pct-kollen

**`master` @ `773ac479`** (efter `git fetch`): inkl. **`0252a44d`** (`vercel_templates_levels/`, `vercel-templates-discovery.md`, `scrape-catalog.spec.ts`, **`.cursorignore`**, progress **~36%**) och **`773ac479`** — **final sweep** för scripts: trimmad **`scripts/README.md`**, **`scripts-scaffolds-inventory`**, orchestrator **closeout** / run-summaries, progress **~37%** helhet och **scripts-spår ~32%** (se progress för +43%-noten).

---

*Filnamn behålls för historik (`18pct-k`).*
