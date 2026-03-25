# Arkiverad kritik — kedjan `ceaee87b` → `b428b2ff` (~27pct)

**Ursprung:** granskning efter tier2 (UTF-8 `landing-chat-data`, `integrationRegistry`-scaffold).  
**Raducerad:** det mesta nedan är **åtgärdat** i senare commits; filen finns kvar som spårbarhet.

## Punkter som *var* öppna → status nu

| Kritik | Status |
|--------|--------|
| Progress-text vs tabell (~24% vs ~27%) | **Fixat** (senare progress-versioner) |
| `extract-landing-chat-data.mjs` rad 137–746 skört | **Delvis:** **vakt** (`categories`-check) i `bb9542b5`; fortfarande radbundet men stoppar korruption |
| `write-tier2-run.mjs` fast datum i path | **Fixat:** CLI `node scripts/write-tier2-run.mjs [run-id]` |
| `chat-area` megafil | **Delvis:** data/hooks ut; hero/footer/background ut; filen kan fortfarande vara stor |
| `detect-integrations` vs registry (två sanningar) | **Fixat:** `DETECTION_PIPELINE` + `integrationRegistry` (`5f240925`) |
| OpenAI `category: "other"` / minimal Supabase-env | **Låg prio** — ev. utöka registry vid behov |

## Validering (då)

`npm run typecheck` var grönt på relevant `master` vid granskningstillfället.

**Senast avstämd `master`:** `773ac479` — se `18pct-k.md` eller progress-dok (~37pct + scripts final sweep).

---

*Filnamn behålls för historik (`27pct-w`).*
