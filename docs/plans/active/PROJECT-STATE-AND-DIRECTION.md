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

- Steg 3: bygg faktisk LLM-input — statisk prompt, dynamisk kontext, budgetar, prioritering/pruning och exakt vad modellen verkligen får.

## Arbetsprinciper

- Ett steg i taget, smala pass hellre än breda svep.
- Runtime-sanning går före gamla docs.
- Extern review är värdefull input, men inte sanning förrän verifierad mot kod och aktuella artifacts.
