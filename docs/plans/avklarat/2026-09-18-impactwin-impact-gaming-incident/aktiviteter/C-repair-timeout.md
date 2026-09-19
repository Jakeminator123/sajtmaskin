# C — repair-timeout: terminal status efter hård kill

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: DONE via #1486.
Typ: **avbrott/återhämtning**, inte höjd tidsgräns.

## Problemet (observation)

`POST /api/v0/deployments/repair` 15:10:24Z mot failad deploy
`dpl_39P3KSusnZLwK8i8RQtpAyWgb24m` slutade med:

```text
HTTP 504
Vercel Runtime Timeout Error: Task timed out after 950 seconds
```

950 s = route-ens `maxDuration`. Efteråt:

- `verification_state = repairing`
- `verification_summary = Server-side repair in progress.`
- ingen `repaired_files_json` / `repair_available_at`
- ingen andra Vercel-deploy (Ö3: endpointen ska inte auto-publicera)

`/logg` såg status `0` medan requesten fortfarande levde. 504 är den
terminala plattformssignalen.

Fly patchade 2 filer 15:11:16Z på samma version. Loopen *startade*. Vilket
await som sedan åt resten av budgeten är obevisat — instrumentera, gissa inte
LLM vs verify vs nätverk.

## Redan på plats

- Ö3: repair → `repair_available` → accept → manuell publicering. Behåll.
- `REPAIR_LOOP_BUDGET_MS` är avsedd att sluta *före* platform-kill så leasen
  släpps (`repair/route.ts`-kommentar). Den kedjan höll inte här.
- `SM-076` (#1242): JS-`catch` + oförändrad `files_json` → fail, inte hängande
  `repairing`. Isolate-kill kör inte den `catch`:en.
- Repair-route `catch` returnerar 500 — aldrig nådd vid 504.

## Gör

### C1 — fail-closed vid hård timeout

När plattformen dödar isolatet, eller loopen själv ser att budgeten är slut
utan sparad kandidat: lämna **terminal** `failed` (eller motsvarande ärlig
status) + copy som säger att reparationen avbröts, inte att den pågår.

Det kräver en väg *utanför* in-process-`catch`: watchdog, lease-expiry som
skriver fail, eller att budget-stoppet faktiskt nås och persisterar *innan*
950 s. Bevisa med test att «startade repairing, dog utan kandidat» inte kan
kvarstå.

### C2 — synlig UI-sanning

Knappen/toasten får inte fastna i «En reparation körs redan» efter en 504.
`repairing` utan färsk lease är död, inte busy.

### C3 — mät vilket steg som åt budgeten

Lägg fassignaler (start/slut + duration) för de awaits repair-loopen redan
har: bygglogg-hämtning, LLM-pass, preview-verify. Inte nytt telemetrisystem.
Målet är nästa timeout, inte en post-hoc-gissning om Impact Gaming.

Höj inte `maxDuration` som lösning. Om budgeten *redan* ska sluta tidigare
är felet att den inte gjorde det.

## Inte C

- Auto-redeploy efter timeout.
- «Försök igen» som tyst startar en ny 950 s-loop utan att först faila den
  hängande raden.
- Skylla timeouten på en specifik modell utan C3.
