---
id: gm-akt-S4
status: koordinering
parent: gm-omrade-02-stabilitetstester
blocked_by: []
owner_files: []
extern_agare: "parallell PR (annan agent) — pydatabastest.py + .github/workflows/"
risk: medel
---

# S4 — DB-health/sync-gate (koordinerar in-flight PR)

## Bakgrund
En parallell agent bygger `pydatabastest.py` (DB- + blob-sync-health-test) i **egen
separat PR**, tänkt som regressions-/ordningsgate på `pull_request`/`push`. Den här
filen **äger ingen kod** — den knyter in det arbetet i stability-lanen så vi inte får
två drivande test-spår. (Wipe-agenten lämnade dessutom `scripts/db/wipe-generated-sites.mjs`
otrackad; den hör inte hit.)

## Min bedömning (svar på "vad säger du?")
Bra idé och rätt hemvist (stabilitetstest, inte governance). Den fångar precis sånt vi
vill låsa — t.ex. **dev/prod schema-drift** (CASCADE-driften på `generation_telemetry.chat_id`
som hittades under wipen). Villkor för att den ska bli en bra gate:

| Krav | Varför |
|---|---|
| **Read-only health** i CI (schema/RLS/förväntade tabeller, drift dev↔prod) | En gate på varje push får aldrig skriva/radera i riktig DB |
| Kör **inte destruktivt mot prod** i CI; mot test-/CI-DB eller read-only | Prod-writes är irreversibla |
| **CI-secrets**, aldrig creds i git/loggar; pulled `.env.vercel.*` gitignoreras | Grundhygien (`project-phase-priorities.mdc`) |
| **Egen lane**, blockerar inte JS-`test:stability` | Dubbel-runtime (Python) får inte bromsa kärnlanen |
| `--ci`-läge deterministiskt + snabbt | Annars blir det "Sajtbyggaren-tröghet" |
| Namn/plats enligt kebab-case (ev. `scripts/db/db-health-check.py`) | Undvik namnskuggor; speglar `sajtmaskin_backoffice.py`-konventionen |

## Inte scope (för denna grandmaster-PR)
- Implementera testet (det lever i sin egen PR).
- Wire:a in det i `ci.yml` här — görs i den PR:en + S1-lanen.

## Verifiering (när dess PR landar)
- `pydatabastest.py --ci` grön; inga creds i diff; prod orörd; egen workflow-lane.

## Risk
Medel — rör CI + DB-creds, och ägs av annan agent. Koordineras, granskas separat.
