# Autonoma anhalter — fortsätt utan “okej” per rad

Det här dokumentet styr **hur** remediation får löpa i etapper så att du inte behöver skriva godkännande mellan varje liten ändring.

## Principer

1. **En halt = ett stopp** som kräver mänsklig eller ny session: röd `npm run typecheck`, röd `npx vitest run`, merge-konflikt, säkerhets-/hemlighetsläcka, eller uttryckligt **produktbeslut** (copy, beteende som inte står i track-filen).
2. **Ingen halt** för: varje checkbox i `track-w*.md`, normal refaktor inom tilldelat filträd, dokumentationsjusteringar som följer samma beslut.
3. **Commit-cadence:** sikta på **~4–5 enheter** på **Whole vision** mellan commits när volymen räcker (se `external-review-remediation-progress.md`). Undvik mikrocommits på 1–2 % om flera säkra punkter kan levereras i samma gröna testkörning.
4. **Push:** efter varje sådan commit till avtalad branch (`master` om inget annat sägs).

## Praktiskt i Cursor / agenter

- **Orchestrator eller worker** läser `MASTER-ROADMAP.md` + relevant `track-w*.md`, implementerar **nästa öppna punkt(er)** tills en halt inträffar eller en batch enligt punkt 3 är rimlig.
- När en session tar slut: nästa gång du vill fortsätta räcker en kort prompt, t.ex.  
  `Fortsätt external-review enligt docs/plans/active/external-review-execution/ — nästa öppna kryss, samma commit-rutin.`
- **Parallellt:** endast enligt tabellen i `MASTER-ROADMAP.md` (t.ex. W3 + W4 när filträd skiljer).

## Verifiering före commit

```bash
npm run typecheck && npx vitest run
```

Valfritt efter större TS/TSX-ytor:

```bash
npx eslint <ändrade filer eller .>
```

Uppdatera progress-%, track-kryss, `MASTER-ROADMAP` → *Orchestrator / verifiering*, och `.cursor/orchestrator/ORCHESTRATOR_LOG.md` vid batchens slut.
