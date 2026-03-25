# Separat notis — Vercel-templates-sökväg, “spökmapp” och parallell agent-verifiering

**Syfte:** Det här är *inte* samma sak som hela external-review-remediation (~39pct m.m.). Det dokumenterar en **avgränsad tråd**: rotmappen `vercel_templates_levels/`, Playwright-specens plats, gitignore/cursorignore, och **förvirring** som uppstått när flera agenter beskrivit läget olika.

**Kanonisk teknisk källa i repot:** `docs/architecture/vercel-templates-playwright-scaffold-integration.txt` (ordlista, pipeline, gränser mot v0-mallar vs scaffolds vs template-library).

---

## 1. Vad problemet var (produkt-/repo-nivå)

- En **Playwright-spec** skrapar Vercel Templates-katalogen och matar **raw discovery** → template-library-flödet.
- Specen har legat under **`vercel_templates_levels/tests/`** och committats, **tagits bort från index** (lokal-only + ignore), och slutligen fått en **spårad** motsvarighet under **`e2e/vercel-templates/`**.
- **`package.json`** skripten `references:discover*` måste peka på en sökväg som **finns i en färsk clone** — annars “funkar det på min maskin” men inte för teamet/CI.

**Nuvarande läge (verifiera med `git grep references:discover package.json`):** sökvägen är **`e2e/vercel-templates/scrape-catalog.spec.ts`**.

---

## 2. Vad som var förvirring mellan agenter / människor

| Påstående / fråga | Bedömning |
|-------------------|-----------|
| “Mappen har inte funnits i repot på en vecka” | **Otydligt.** På **`origin/master`** fanns mappen **kort spårad** kring restore-commiten innan den åter blev ignore-only; **`origin/main`** har ofta legat **flera commits efter** utan att få samma ändringar. “En vecka” matchar sällan exakt git-datum utan att precisera **gren** och **commit-intervall**. |
| `main` vs `master` på GitHub | I detta repo pekar **`origin/HEAD` → `master`**. **`main` kan vara efter** — då ser två personer **olika** repo-tillstånd om de klonar olika default-grenar. |
| `Hamta_alla_sidor.py` | **Finns inte** i repot. Rätt namn är bl.a. **`scripts/hamta_sidor.py`** (och ev. `hamta_sidor_branch_emil.py`). |
| “Verifiera mot GitHub” | Lokalt: **`git fetch` + `git ls-tree` / `git log`** mot `origin/*` är samma sanning som remote så länge fetch är färsk — inte magisk webbläsaråtkomst. |

---

## 3. Roll för en “parallell granskare” (t.ex. den här agenten)

- **Ja:** jämföra en annan agents **sammanfattning** mot **faktisk git-träd** och **öppna filer** (ignore, `package.json`, docs).
- **Nej:** det ersätter inte en full **buggrötning** av Playwright eller Vercel; det är **faktakontroll** och **begreppsstädning**.

---

## 4. Rekommenderade checks efter framtida ändringar i den här tråden

1. `git ls-files e2e/vercel-templates/` — specen ska synas om den ska vara kanonisk.  
2. `git check-ignore -v vercel_templates_levels` — bekräfta att spillmappen är ignore:ad om policy är “local only”.  
3. `npm run references:discover -- --list` eller motsvarande snabb test i ren clone (valfritt).  
4. Läs **`vercel-templates-playwright-scaffold-integration.txt`** innan man blandar in **v0 `templates:*`**-skript.

---

## 5. Relation till övrig remediation

External-review-progress (~39pct) nämner W2-registry, Vitest/e2e-exkludering och denna Playwright-flytt **som en rad** i en större plan. **Den här filen** är avsedd att isolera **path/ignore/agent-kommunikations**-problemet så det inte drunknar i landning/integration/own-engine-diskussionen.

---

*Skriven som separat spår från allmän remediation-kritik (`18pct-k`, `27pct-w`, …). Uppdatera datum här vid större policyändring.*
