# Prompt dumps

`data/prompt-dumps/` innehåller lokala, opt-in dumpar av de prompter som skickas till own-engine och orchestreringen. De skrivs bara när `SAJTMASKIN_PROMPT_DUMP=1` är satt.

- `own-engine-codegen/` — `meta.json`, `full-system.md`, `dynamic-context.md` för senaste codegen-anropet.
- `orchestration-dynamic/` — `meta.json`, `latest.md` för dynamiskt orkestreringskontext.

Allt under denna mapp utom README:n är gitignored (`.gitignore`: `data/prompt-dumps/*` + `!data/prompt-dumps/README.md`). Behandla dumparna som potentiellt känsliga — de kan innehålla inklistrad kundtext, prompt-innehåll eller konfiguration.
