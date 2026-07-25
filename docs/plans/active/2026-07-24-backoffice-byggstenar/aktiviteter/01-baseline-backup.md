---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice — fabriksåterställningen säkerhetskopierar innan den raderar (dataförlust)
source: Kodläsning backoffice/pages/scaffold_lifecycle.py + Codex/coach-granskning av PR #615
---

# Etapp 2 — baseline-backup före radering (egen liten PR)

**Ta denna först.** Den är oberoende av UI-arbetet i Fas B/C och ska levereras som
en **egen, liten PR** — ett skyddsnät ska inte vänta på att en UI-omläggning blir klar.

Master-plan: [`../00-master-plan.md`](../00-master-plan.md).

## Problem (verifierat i master)

`_factory_reset_to_baseline()` i `backoffice/pages/scaffold_lifecycle.py`:

1. kör `git restore --source scaffold-baseline-v1 --staged --worktree` för
   `BASELINE_PATHS` — **detta är redan säkert och ska inte ändras**;
2. raderar därefter varje fil i `drift["added_since_tag"] + drift["untracked"]`
   med `target.unlink()` — **utan att säkerhetskopiera dem först**.

Spårade filer går att gräva fram ur git-historiken. **Ospårade filer finns varken
i git eller i backup-lagret** (`data/backoffice/backups/`) → raderingen är helt
oåterkallelig. Det är den enda riktiga dataförlusten i backoffice idag.

## Vad som INTE ska göras

* **Ingen tredje bekräftelse.** Kryssruta + exakt taggnamn + lista över avvikande
  filer finns redan i `_render_baseline_tab`. Problemet är återställbarhet, inte
  friktion — mer friktion löser fel problem.
* **Ändra inte ordningen** `git restore` → radera. Den är transaktionellt korrekt
  (ett restore-fel får inte radera något) och skyddas av
  `test_scaffold_baseline_reset.py::test_restore_failure_deletes_nothing`.
* Rör inte `BASELINE_PATHS`, `BASELINE_TAG` eller "flytta baselinen"-flödet.

## Vad som ska göras

1. **Backup före `unlink`**, med samma fail-closed-mönster som scaffold-raderingen
   redan använder (`backup_* is None → avbryt utan att radera`):

   ```text
   for rel in drift["added_since_tag"] + drift["untracked"]:
       target = ctx.repo_root / rel
       if target.is_file():
           if backup_file(target, ctx.repo_root) is None:
               raise RuntimeError(
                   f"Kunde inte säkerhetskopiera {rel} — avbryter, inget raderades."
               )
   ... först därefter unlink ...
   ```

   `backup_file` är redan importerad i modulen. Snapshots hamnar i
   `data/backoffice/backups/files/<rel>/<utc>.bak` (gitignorerat) och blir därmed
   synliga i sidan **Återställning**.

2. **Ospårade filer måste täckas explicit** — de är det enda oåterkalleliga.
   Fungerar automatiskt med punkt 1, men testet ska bevisa det.

3. **UI-texten i `_render_baseline_tab`**: `st.error(...)`-blocket lovar idag bara
   att avvikelserna "försvinner". Skriv att filer som raderas
   **säkerhetskopieras först och kan rullas tillbaka från Återställning**.

4. **Start-sidans copy** i `backoffice/pages/overview.py` säger att "git är alltid
   det yttersta skyddsnätet för spårade filer" i en `st.success`-ruta vars rubrik
   är "Tryggt att experimentera". Formuleringen är osann för **ospårade** filer —
   justera den i samma PR (t.ex. "git täcker spårade filer; ospårade filer skyddas
   av backup-lagret, som nu tas även före fabriksåterställning").

## Tester (utöka `backoffice/test_scaffold_baseline_reset.py`)

Befintliga tre tester ska passera oförändrade. Lägg till:

| Test | Assertion |
|---|---|
| `test_backup_taken_before_delete` | Efter `_factory_reset_to_baseline` finns `.bak` under `data/backoffice/backups/files/<rel>/` för **både** `untracked.txt` och `staged.txt`, med originalinnehållet — och filerna är borta från arbetsträdet |
| `test_backup_failure_aborts_without_deleting` | `mock.patch.object(sl, "backup_file", return_value=None)` → `RuntimeError`, **ingen** fil raderad |
| (valfritt) `test_backup_runs_before_unlink` | Ordningsbevis: en `side_effect` som loggar anropsordningen, eller att backupen finns kvar även när `unlink` mockas att kasta |

Testerna kallar funktionen med `ctx = SimpleNamespace(repo_root=tmp)` — **kräv inga
andra `ctx`-fält** i den nya koden.

## Verifiering

```bash
npm run backoffice:test      # inkl. test_scaffold_baseline_reset
npm run scaffolds:validate   # rör inte scaffold-data, men billigt att bekräfta
```

Manuellt (valfritt men bra): skapa en ospårad fil under `src/lib/gen/scaffolds/`,
kör fabriksåterställningen i UI:t, och visa att filen dyker upp i **Återställning**.
Gör det i en **separat git-worktree** så huvudcheckouten inte smutsas.

## Acceptans

* Ospårade filer kan återställas efter en fabriksåterställning.
* Misslyckad backup avbryter utan att radera något.
* UI-texten och Start-sidans copy stämmer med verkligheten.
* Inga nya bekräftelsesteg, ingen ändrad restore-ordning, inga andra beteendeändringar.
