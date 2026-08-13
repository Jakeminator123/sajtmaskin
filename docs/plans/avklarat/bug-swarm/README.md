# Bug-swarm — tunt historikindex

Full text för arkiv och omstrukturering ligger i **git-historik**. Rör inte
`BUG-SWARM-BACKLOG.md`s aktiva sektioner härifrån.

## Högsta förbrukade `SM`-ID

**`SM-045`** (2026-08-13). Nästa nya rad = `SM-046`. Återanvänd aldrig ett nummer —
räkna även mot git-historiken för raderade arkivfiler om du är osäker.

```powershell
git log -S 'SM-' --oneline -- docs/plans/avklarat/bug-swarm/ BUG-SWARM-BACKLOG.md
```

## Arkivfiler (borttagna 2026-08-10 — återställ via git)

| Tidigare fil                            | Innehåll                            |
| --------------------------------------- | ----------------------------------- |
| `backlog-arkiv-2026-07-25.md`           | Senaste `[x]`-arkivet före trim     |
| `backlog-arkiv-2026-07-24.md`           | Äldre `[x]`                         |
| `backlog-arkiv-2026-07-22.md`           | Äldre `[x]`                         |
| `backlog-arkiv-2026-07-02.md`           | Äldre `[x]`                         |
| `backlog-arkiv-2026-06-27.md`           | Äldre `[x]`                         |
| `backlog-arkiv-2026-06-24.md`           | Äldre `[x]`                         |
| `backlog-omstrukturering-2026-08-05.md` | R1–R55-matris + fryst pre-migration |
| `beslutskluster-arkiv-2026-08-10.md`    | Tidigare beslutskluster (essäform)  |

```powershell
git log --all --full-history -- "docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-07-25.md"
git show <sha>:docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-07-25.md
```

## Nya avslutade rader

När en `SM-###`-rad fixas: **flytta** den till `## Arkiv` i
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) som `[x]` med PR/commit-ref.
Skapa inte nya stora `backlog-arkiv-*.md`-filer.

## Grandmaster B01–B15 (2026-06)

Konsoliderad svärm; detaljtext fanns tidigare i denna fil (~50 KB) och finns i
git-historiken före 2026-08-10-trimmen. Kort status som då gällde:

| ID                                          | Lägesammanfattning                                           |
| ------------------------------------------- | ------------------------------------------------------------ |
| B01, B03, B04, B06, B09–B11, B14, B15, B-GA | Löst (#181/183/184/185/186/187 m.fl.)                        |
| B05                                         | Policy/latent — se aktiv backlog / skuld om den lever vidare |
| B07, B08                                    | Policy (ägarbeslut)                                          |
| B12, B13                                    | Edge / needs-repro historik                                  |

Öppna defekter i dag: bara [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).
