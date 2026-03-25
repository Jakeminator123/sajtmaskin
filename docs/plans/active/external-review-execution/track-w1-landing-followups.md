# Track W1 — Landing follow-ups (valfritt)

**Källa:** `external-review-remediation-progress.md` → Uncertainties / Next  
**Parallellt med:** W4. **Ej** parallellt med W3 om samma agent-session rör både landning och stream-routes — dela upp.

---

## Uppdrag för worker-agent

1. Små, isolerade ändringar; bocka `- [x]` per levererad punkt.
2. `npm run typecheck && npx vitest run` (ev. komponenttester om UI).
3. Uppdatera progress-doc om landnings-% ändras.
4. `MASTER-ROADMAP.md` → *Orchestrator / verifiering*.

---

## Checklista

- [ ] **3D / in-view:** tunga landnings-3D-delar respekterar in-view där det saknas (utöver befintlig reduced-motion)
- [ ] **IntegrationCard:** `prefers-reduced-motion` för float-/CSS-animationer (matcha mönster från `landing-background`)
- [ ] **Produkt:** dedikerade sidor för footer-länkar “Om oss” / “Blogg” *eller* medveten copy om de medvetet pekar på `/faq` (endast om produktbeslut finns)

---

## Exit-kriterium

Valda punkter `[x]`, inga regressions i landnings-Lighthouse/UX du bryr dig om, tester gröna.
