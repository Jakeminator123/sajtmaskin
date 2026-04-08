# Project State And Direction

Kort kanonisk aktiv status tills ett bredare backlog-pass uppdaterar filen mer fullt.

## Aktiv riktning

- Own-engine är den enda aktiva codegen-vägen.
- Runtime-scaffolds i `src/lib/gen/scaffolds/` är separata från builderns `v0-mallar` i `src/lib/templates/` och från externa Vercel-referenser / `template-library`.
- Preview-kedjan går framåt via VM / `preview_host`; kvarvarande `sandbox`-namn är legacy-kontrakt och naming debt.
- `config/dashboard/app.py` är konfigurations-/översiktspanel, medan `scripts/scripts_dashboard.py` är pipeline-/artifactpanel.

## Pågående fokus

1. Stegvis granskning av builderns LLM-flöde enligt `LLM_KEDJA_STEG_FOR_STEG.txt`.
2. Synka mindmap, schema/docs och dashboardar när runtime-sanning ändras.
3. Rensa naming debt, döda grenar och missvisande legacyspår när ny logik redan tagit över.

## Nästa aktiva steg

- **5-stegsgenomgången är avslutad.** Samlad sammanfattning, syfte per steg och kvarvarande problemområden finns i `5-steg.txt`.
- **Steg 4-referens:** `docs/plans/active/step4-quality-hotspots-and-verification.md` behålls som smal referens för finalize-/verify-hotspots, inte som fortsatt huvudplan.
- **Nästa huvudspår efter review:** riktade pass på `/api/v0/` compat, `sandbox`-naming debt, full preview lifecycle och eventuell dead-path/dead-tooling-audit.
- **Parkering i detta pass:** ingen bred rensning av `/api/v0/`, `sandbox`-namn, `legacyShimPreviewUrl` eller `template-library`/extern-pipeline utan separat migreringspass.

## Arbetsprinciper

- Ett steg i taget, smala pass hellre än breda svep.
- Runtime-sanning går före gamla docs.
- Extern review är värdefull input, men inte sanning förrän verifierad mot kod och aktuella artifacts.
