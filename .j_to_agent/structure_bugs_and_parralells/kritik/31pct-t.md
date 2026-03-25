# Arkiverad kritik — segment `5f240925` … `bb9542b5` (~31pct + fixar)

**Ursprung:** wire detect→registry, `LandingHero`/`LandingFooter`, extract-vakt, tier2 CLI, PS1 exit codes.  
**Raducerad:** nästan allt i den rapporten är infört; SQLite-copy fixades i **`bf58d0cc`**.

## Kvar från den tiden (fortfarande relevant)

- **Extract-skript:** vakt OK; **markörer/robust parse** i stället för fasta rader — fortfarande önskvärt långsiktigt.
- **`REGISTRY_BY_PROVIDER`:** flera rader med samma `provider` skulle kollidera — inget akut med nuvarande poster.
- **Nästa plan (då):** `LandingBackground` — **gjort** i `62cdcd2b` (~34pct). Kvar enligt progress: t.ex. **float-animationer** utanför bakgrund, manifest/deploy, own-engine, scripts-hygien.

## Slutsats (uppdaterad)

Segmentet var **sunt**; tidigare slutsats om “SQLite måste rättas” är **inaktuell** efter `bf58d0cc`.

**Senast avstämd `master`:** `773ac479` (~37pct; se progress — inkl. scripts README / orchestrator closeout).

---

*Filnamn behålls för historik (`31pct-t`).*
