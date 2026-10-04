## Vad ändras?

- Kort scope:
- Canonical owner:
- Base-SHA:
- Ursprungsagent: <!-- Cursor bc-<uuid>, Codex-tråd eller "lokal session <namn>". Skriv "människa" om ingen agent skrev diffen. Fältet finns för att utfall, fynd och kvarvarande arbete ska kunna lämnas tillbaka till den som faktiskt skrev PR:n; Cursors egen footer räcker inte eftersom den bara finns på cloud-agenternas PR:er. -->

- [ ] Branchen innehåller aktuell `preview` (base för vanliga PR:ar; promote-PR:ar mot `master` skapas av `npm run promote`); ingen direktpush eller force-push
- [ ] Arbets-worktreet behålls tills PR:n är mergad eller stängd

## Påverkan från `npm run verify:pr -- --plan`

- Protected paths:
- Backoffice-sidor:
- Schemas/policies (`runtimeStatus`):
- Genererade projektioner:

## Verifiering

- [ ] `npm run verify:pr -- --plan`
- [ ] Oberoende readonly review på aktuell head-SHA
- [ ] Alla P0/P1 är fixade eller verifierbart avfärdade
- [ ] Backoffice-/schema-/dokumentföljder ovan är uppdaterade eller uttryckligen ej träffade
- [ ] Övriga required GitHub-checks (`quality`, Backoffice, schema, build) är gröna för aktuell head-SHA före sign-off

Körda riktade kontroller:

-

## Risk och återställning

- Kvarvarande risk:
- Återställning/rollback:

> Lämna som draft medan arbete, CI-fixar eller reviewtriage återstår.
> Efter gröna checks, oberoende review och tidsgolv: posta ready-kommentaren
> före labeln `merge:ready`. Merge kräver ett separat uttryckligt uppdrag,
> färsk head/base-kontroll och manuell `--match-head-commit`; använd inte
> `--auto` eller `--admin`. Trust-root-ändringar behöver dokumenterad
> ägarbootstrap. Promote till `master` kräver extra produktionsbekräftelse.
