# Config-dashboard: var filer och dokumentation bor

På repo-roten finns några **syskonmappar** som hör ihop när du redigerar konfiguration i webbläsaren (plus `.cursor/` för agentregler):

| Mapp | Roll |
|------|------|
| **`config/`** | Kanoniska källfiler (JSON, markdown, txt) som **Next.js, skript och runtime** faktiskt läser. `config-dashboard` skriver hit när du sparar. |
| **`config-dashboard/`** | Streamlit-app (`python app.py`). **Importeras inte** av produktionskoden; den är bara ett redigeringsgränssnitt. |
| **`docs/`** | Längre förklaringar, arkitektur och runbooks. Ligger **vid sidan av** `config/` — samma syskonnivå som `config-dashboard/`. Dashboarden **ändrar inte** `docs/` automatiskt — **undantag:** vyn **Cursor-agenter** kan spara `docs/architecture/structure-and-terminology.md`. |
| **`.cursor/`** | Projektregler för Cursor (t.ex. `rules/terminology.mdc`). Redigeras från dashboardens vy **Cursor-agenter**. |

## Två träd

- **`config/*`** = det som måste vara **konsekvent och validerbart** för att kod ska köras.
- **`docs/*`** = **mänsklig kontext** för agenter och utvecklare; kan sakna eller släpa efter `config/` om någon glömmer uppdatera texten.

Därför finns en **maskinläsbar karta** i [`config-dashboard/domain-map.json`](../../../../config-dashboard/domain-map.json) (vy → `canonicalPaths`, `docsPaths`, `codeReaders`) och samma information visas i dashboarden under *Var ligger detta?*.

## Uppdateringsdisciplin

När du ändrar beteende som beskrivs i `docs/` ska motsvarande **`config/`** (eller kod) uppdateras om det är där sanningen lever — och tvärtom: ändringar i `config/` bör reflekteras i relevant `docs/`-sida om andra ska förstå *varför*.

## Se även

- [`config-dashboard/domain-map.json`](../../../../config-dashboard/domain-map.json)
- [`docs/architecture/builder-prompt-layer.md`](builder-prompt-layer.md)
- [`docs/ENV.md`](../../../ENV.md)
