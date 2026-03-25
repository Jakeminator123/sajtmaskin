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

- [x] **3D / in-view:** `ParticleOrb` (R3F) mountas först efter `useInView`; tom yta tills dess — minskar WebGL-kostnad ovanför fold; `dpr={[1, 1.65]}` när Canvas är aktiv
- [x] **LanyardBadge:** `useInView` — drop + pendel-RAF startar först i viewport; `usePrefersReducedMotion` — statiskt kort, ingen `animate-ping`, ingen drag
- [x] **IntegrationCard:** `usePrefersReducedMotion` — ingen `float-particle-kf` vid reduce; `FeatureModal`-partiklar samma
- [x] **Produkt:** dedikerade sidor **`/om`** och **`/blogg`** + landnings-footer uppdaterad; sitemap inkluderar `/faq`, `/om`, `/blogg`

---

## Exit-kriterium

Valda punkter `[x]`, inga regressions i landnings-Lighthouse/UX du bryr dig om, tester gröna.
