# P5 — opt-in och rollout

## Mål

Släppa agentläget gradvis med permanent fallback och tydliga säkerhetsgrindar.

## Leveranser

- opt-in/feature flag per cohort
- A/B-allokering och kostnadsgräns
- classic fallback
- kill switch, tokenrevocation och ködränering
- dashboards och incidentrunbook
- cohortplan för F2, follow-up, imported och F3

## Arbetssteg

1. Interna enkla F2-initbyggen.
2. Opt-in för ägare/testare.
3. Liten extern F2-cohort.
4. Höj endast efter separat säkerhets- och kvalitetsreview.
5. Öppna vanliga follow-ups som egen cohort.
6. Öppna flerroute/tyngre appar.
7. Imported repos och F3 sist.
8. Behåll classic som permanent recovery lane tills data motiverar annat.

## Acceptans

- noll tenant-/secret-/stale-/double-persist-incidenter
- befintliga gates är auktoritativa i varje lane
- kill switch och tokenrevocation är övade
- fallback lämnar ärlig status och skapar inte dold dubbeldebitering
- kvalitet, preservation, p95 och kostnad rapporteras per cohort

## Stoppskäl

- regression i preservation eller dossierkontrakt
- oförklarade filändringar
- drift mellan agentens kontrakt och masterowners
- återkommande OOM/timeouts utan kontrollerad fallback
