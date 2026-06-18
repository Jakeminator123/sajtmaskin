# Kontraktslager (lätt)

Fyra pelare som låser sanning på olika sätt. Tre finns redan i repot — de är bara
samlade och namngivna här. Håll lätt: lås format/värden/beslut, bygg **inte** ett
styrningslager (jfr Sajtbyggarens tunga `governance/` — porteras inte).

| Pelare | Låser | Bor i | Status |
|---|---|---|---|
| **Schemas** | *Struktur/format* på dataartefakter (dossier, scaffold-variant, prompt, telemetri-event) | [`docs/schemas/`](../schemas/) | finns |
| **Policies** | *Värden/mappningar* — tillåtna värden, signal-källor, trösklar | `config/*.json` — se [`policies/`](policies/) | finns (utspritt) |
| **Regler** | *Process/konvention* — hur kod/planer/PR görs | [`.cursor/rules/`](../../.cursor/rules/) | finns |
| **Beslut (ADR)** | *Varför* — beslutslogg, en rad per arkitekturval | [`beslut/`](beslut/) | **ny** |

"ADR" (Architecture Decision Record) = beslutslogg. Det är samma sak som "beslut"
— därför **en** pelare, inte två.

> Schema = hur något *ser ut*. Policy = vilka *värden* som gäller. Regel = hur vi
> *arbetar*. Beslut = *varför* vi valde så.

Fysisk flytt av `docs/schemas/` + `config/`-policies hit under `contracts/` är en
städnings-aktivitet senare (bred ref-diff). Nu: index + den nya beslut-pelaren.
