## Vad ändras?

- Kort scope:
- Canonical owner:
- Base-SHA:
- Ursprungsagent: <!-- Cursor bc-<uuid>, Codex-tråd eller "lokal session <namn>". Skriv "människa" om ingen agent skrev diffen. Fältet finns för att utfall, fynd och kvarvarande arbete ska kunna lämnas tillbaka till den som faktiskt skrev PR:n; Cursors egen footer räcker inte eftersom den bara finns på cloud-agenternas PR:er. -->


- [ ] Branchen innehåller aktuell `master`; ingen direktpush eller force-push
- [ ] Arbets-worktreet behålls tills PR:n är mergad eller stängd

## Påverkan från `npm run verify:pr -- --plan`

- Protected paths:
- Backoffice-sidor:
- Schemas/policies (`runtimeStatus`):
- Genererade projektioner:

## Verifiering

- [ ] `npm run verify:pr`
- [ ] Oberoende readonly review på aktuell head-SHA
- [ ] Alla P0/P1 är fixade eller verifierbart avfärdade
- [ ] Backoffice-/schema-/dokumentföljder ovan är uppdaterade eller uttryckligen ej träffade
- [ ] Övriga required checks (`quality`, Backoffice, schema, build) är gröna före sign-off

Körda riktade kontroller:

-

## Risk och återställning

- Kvarvarande risk:
- Återställning/rollback:

> Lämna som draft medan arbete, CI-fixar eller reviewtriage återstår. När alla
> checks utom `review-window` och alla reviewfynd är klara: posta först
> `merge:ready — head-sha: <40 hex>, base-sha: <40 hex>, …` som kommentar och
> sätt sedan labeln. `review-window` blir grön först efter sin betrodda
> live-validering; båda SHA:na måste fortfarande vara aktuella.
