# Parallell granskning — segment `b428b2ff` → `bb9542b5` (`master`)

**Granskad tip:** `bb9542b5` — `fix: guard landing extract script, tier2 run CLI arg, PS1 exit codes`  
**Föregående kända tip (förra rapporten):** `b428b2ff` (~27pct)  
**Repo:** `C:\Users\jakem\dev\projects\sajtmaskin` — **`master` = `origin/master`** efter `git fetch`

---

## 1. Nya commits i segmentet

| SHA | Meddelande |
|-----|------------|
| `5f240925` | `feat(remediation): ~29pct wire detect-integrations to integrationRegistry` |
| `50bcfcc4` | `feat(remediation): ~31pct split LandingHero and LandingFooter from chat-area` |
| `bb9542b5` | `fix: guard landing extract script, tier2 run CLI arg, PS1 exit codes` |

**Diff (aggregerat):** 10 filer, +584 / −432 rader (ungefär).

---

## 2. Progress-dokument (stämmer med leverans)

`external-review-remediation-progress.md` är **internkonsekvent**: inledning **~31%** / **~68%** landning matchar tabellen (**Whole ~31%**, **Landing ~68%**, **Integrationer ~22%**). Föregående glapp (~24% vs tabell) är åtgärdat.

---

## 3. Validering

- **`npm run typecheck`** på aktuell `master`: **OK** (exit 0).

---

## 4. Styrkor

1. **`detect-integrations.ts` + registry:** `DETECTION_PIPELINE` med `source: "registry"` vs `inline` är ett tydligt mönster — visningsmetadata (namn, env, guide) hämtas från `integrationRegistry` där det hör hemma; regex/heuristik stannar i pipeline. `throw` om registry-post saknas för en `registryProvider` ger **fail-fast** mot tyst drift.
2. **`LandingHero` / `LandingFooter`:** tydlig uppdelning; `LandingController` som `ReturnType<typeof useLandingController>` ger **säkra prop-typer** utan manuell duplicering.
3. **`extract-landing-chat-data.mjs`:** avbryter om slicad ruta inte innehåller `export const categories` — adresserar risken att gamla radnummer **skriver sönder** `landing-chat-data.ts`. Bra kommentar om att data nu lever i `landing-chat-data.ts`.
4. **`write-tier2-run.mjs`:** valfritt run-id som `argv[2]` med kvarvarande default — svarar mot tidigare kritik om hårdkodad sökväg.
5. **`config-dashboard/run.ps1`:** propagerar **pip/install exit code** och avslutar med `python`s kod — mindre risk att CI/scripts tror att köret lyckades när pip misslyckades.

---

## 5. Svagheter / att följa upp

### 5.1 SQLite `setupGuide` — svenska/ASCII

**Uppföljning (2026-03-25):** På aktuell `master` är SQLite-radens `setupGuide` korrekt (*Använd*, *är*, *För* m.m.). Punkten nedan avser endast om rapportsegmentet granskades mot en äldre revision.

~~I `detect-integrations.ts` (inline-regel för SQLite) innehöll strängen tidigare felaktig ASCII — **copy-bugg**, inte logik.~~

### 5.2 Extraheringsskriptet är fortfarande radbundet

Vakten för `categories` **förhindrar korruption**, men skriptet använder fortfarande **fast slice 137–746**. Om någon **återinför** ett data-block i `chat-area` på andra rader kan skriptet **avsluta med fel** utan att hjälpa — vilket är säkert men kräver manuell uppdatering. Långsiktigt: markörkommentarer som nämnts i filhuvudet.

### 5.3 `REGISTRY_BY_PROVIDER`

Map-nyckel är `provider ?? key`. Så länge varje registry-rad har unik `provider` är det OK; om två rader delade samma `provider` skulle den senare i `map()` **skriva över** (inget indikerat problem i nuvarande 6 poster).

### 5.4 Nästa plansteg (oförändrat i scope)

- `LandingBackground` per läge + reduced-motion / in-view för återstående animationer (`IntegrationCard` float nämns fortfarande i progress).
- Fler providers i registry eller manifest + tunnare deploy; own-engine (`2.txt`); scripts-hygien (`3.txt`).

---

## 6. Slutsats

Segmentet levererar **wire registry → detektion**, **hero/footer-split**, och **verktygsfixar** som stänger luckor från tidigare review (extract-vakt, tier2 CLI, PS1 exit). **Typecheck grön**; **docs och procentsiffror linjerar**. Enda tydliga innehållsfelet i granskad kod: **SQLite-setup-texten** bör rättas stavningsmässigt.

---

*Rapport: `31pct-t.md` — följer helhets-~31pct + unik bokstav.*
