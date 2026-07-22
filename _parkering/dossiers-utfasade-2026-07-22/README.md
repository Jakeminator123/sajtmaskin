# Utfasade dossiers (2026-07-22)

Elva soft-dossiers parkerade vid dossier-taxonomiomtaget (ägarbeslut
2026-07-22): rena innehållssektioner och CSS-effekter som codegen-LLM:en
skriver bättre frihand. Att de låg kvar i runtime-poolen låste designen och
åt promptutrymme utan att skydda mot något återkommande fel.

**Parkerade:** `cta-section`, `faq-accordion`, `feature-grid`, `logo-cloud`,
`pricing-tier-table`, `testimonials-grid`, `stats-counter`, `stepper`,
`marquee-scroller`, `scroll-parallax`, `pointer-parallax`.

- Runtime läser bara `data/dossiers/{hard,soft}/` — inget här laddas.
- Motsvarande capabilities är borttagna ur follow-up-vokabulär, brief-prompt,
  capability-bridge och grupp-mappningen. En gammal snapshot som ännu bär ett
  utfasat capability-id selekterar tyst ingenting (befintligt beteende för
  okända capabilities).
- Kan raderas helt när som helst — git-historiken har originalen
  (`data/dossiers/soft/<id>/`).
