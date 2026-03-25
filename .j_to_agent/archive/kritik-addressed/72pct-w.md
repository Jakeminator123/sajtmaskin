# Parallell granskning — ~72% whole vision, W4 hamta-slice (`d27c54b1`)

**Commit:** `d27c54b1` — `chore: remediation ~72pct — hamta wrapper, legacy-wide flag, W4 docs`  
**Sanning i repo:** `docs/plans/active/external-review-remediation-progress.md` (~72% whole, scripts ~48%).

---

## 1. Leverantörsbeskrivning vs spot-check

### Städ / buggrannsakan — `own-engine-v0-boundary.test.ts`

| Påstående | Status |
|-----------|--------|
| Verifierar att `src/lib/own-engine` och `src/lib/providers/own-engine` finns (`existsSync`) — tydligt fel om Vitest körs utanför repo-roten | **Stämmer** |
| Dubletter av samma fil+regel undviks med `Set` | **Stämmer** (`violations.add(...)`) |

### Python — `scripts/hamta_sidor.py`

| Påstående | Status |
|-----------|--------|
| Wrapper vidarebefordrar till kanon (`hamta_sidor_branch_emil.py`) | **Stämmer** (`subprocess.call`) |
| `--legacy-wide-use-cases` injiceras om den saknas i argv | **Stämmer** |
| `python scripts/hamta_sidor.py --help` visar kanon-hjälp inkl. `--legacy-wide-use-cases` | **Stämmer** (stderr-notis + usage från kanon-skriptet) |

### Kanon — `hamta_sidor_branch_emil.py`

| Påstående | Status |
|-----------|--------|
| `USE_CASES_LEGACY_WIDE` + flaggan `--legacy-wide-use-cases` | **Stämmer** (grep + commit-diff) |

### Dokumentation

| Påstående | Status |
|-----------|--------|
| Uppdaterat: `scripts/README.md`, `scripts-scaffolds-inventory.md`, `research/external-templates/README.md`, `track-w4-scripts.md`, `external-review-remediation-progress.md`, `MASTER-ROADMAP.md`, `orchestrator-workloads-external-review.md`, `ORCHESTRATOR_LOG.md` | **Stämmer** (`git show --stat`) |

*Manuella skript (`extract-static-core.mjs`, `scaffold-pipeline.py`) märkta avancerat/ej i package.json — ej rad-för-rad läst här; följ `scripts/README.md` vid behov.*

---

## 2. Egen verifiering (denna session)

| Kommando | Resultat |
|----------|----------|
| `npm run typecheck` | **OK** |
| `npx vitest run` | **OK** — **345** tester, **79** filer |

---

## 3. Kvar — full W4-exit (leverantör)

- [ ] `track-w4-scripts.md`: Flytt av `scripts/testning_scarf/` (t.ex. `scripts/labs/…`) + uppdatering av `package.json` (`prompt:trace`, `scaffold:suite`, `first-llm:*`, `testning:codegen-print`).

---

## 4. Observation (lätt)

I progress-raden för **Siffror** är **~72%** använt både för *whole vision* och *landnings-spåret* — korrekt om siffrorna råkar sammanfalla, men läsaren kan tolka det som copy-paste-fel; vid nästa redaktion: en kort markör (“oförändrat landning ~72%”) kan minska missförstånd.

---

## 5. Handoff

När `testning_scarf`-flytten är klar: uppdatera `track-w4-scripts.md` + progress-%; överväg att flytta denna fil till `../../archive/kritik-addressed/` och uppdatera `KRITIK-OVERVIEW.md`.

---

*Fil: `72pct-w.md` — W4 hamta + städ, verifierad mot `d27c54b1`.*
