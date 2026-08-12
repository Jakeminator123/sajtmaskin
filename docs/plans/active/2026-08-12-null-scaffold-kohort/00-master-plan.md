# Null-scaffold-kohort + Scaffold: Av

**Status:** öppet · read-only underlag klart · implementation ej startad  
**Branch:** `feat/kontrollstatistik`  
**Bas:** master `5c22e6b1`  
**Källor:** `stats.html` / canvas `prod-logg-14d`, extern reviewer, kodspårning i worktree

## Mål

1. Sluta överdriva `(null)` som “matchern misslyckades / fungerar dåligt”.
2. Mäta rätt: kohort × preview tri-state (ready / failed / pending).
3. Fixa Builderns **Scaffold: Av** så den når servern.
4. Låta template/import fortsätta **preserve-first** (redigerbar vidare utan scaffold-injektion).
5. Separat spår (ägare): tunn bas-stomme för fritext när Av är valt.

## Vad som är bevisat vs inte

| Påstående | Status |
|---|---|
| Template/import tvingar scaffold `off` (`importedRepoMode`) | Bevisat i kod |
| Template ≠ Scaffold: Av (olika finalize-vägar) | Bevisat i kod |
| Av-knappen utelämnar `scaffoldMode: "off"` → server default `auto` | Bevisat i kod |
| Auto-match har nästan alltid fallback-scaffold | Bevisat i kod (`defaultScaffoldForIntent`) |
| Canvas “39 % ready” blandar pending i nämnaren | Bevisat (tri-state: 66/9/23 globalt) |
| De 31 null-runs är mest template-follow-ups | Troligt, **ej** bevisat i prod än |
| Null-kohorten har hög *failed*-rate | **Ej** bevisat (pending kan förklara merparten) |

## Två produktvägar (håll isär)

| Väg | Definition | Får injicera named scaffold? |
|---|---|---|
| **Importerad template/repo** | Repot är grunden. Follow-ups redigerar vidare. Preserve-first (deps/lockfile/syntax OK; ingen landing-page-stomme). | Nej |
| **Fritext + Scaffold: Av** | Ingen named scaffold/design. Fortfarande körbart basprojekt + autofix/QG/preview. Init-only; riv inte bort etablerad scaffold mitt i chatt. | Nej named; ja minimal bas (ägarens stomme / `buildCompleteProject`) |

## Parallellt arbete

| Vem | Vad |
|---|---|
| **Ägare (backoffice)** | Enkel bas-stomme för fritext “Scaffold: Av” — *inte* för template-import |
| **Agent (denna branch)** | Mätning → Av-bugfix → först därefter template-härdning styrd av kohortdata |

## Planerad leveransordning

### Steg A — Read-only prod-diagnos (nästa när env finns)

Kör SELECT-only (t.ex. via `control-stats` env `.env.vercel.production.pulled`).

**A1. Kohort × tri-state för `scaffold_id IS NULL` (14d)**

```sql
-- PV_CUT = samma cutoff som control-stats.mjs (2026-07-03T14:30:00Z)
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM engine_versions ev
      WHERE ev.chat_id = gt.chat_id
        AND ev.edit_kind = 'imported_repo'
    ) THEN 'imported_repo'
    WHEN gt.scaffold_selection_method = 'off' THEN 'scaffold_off'
    WHEN gt.scaffold_selection_method = 'manual'
         AND gt.scaffold_id IS NULL THEN 'invalid_manual'
    ELSE 'unknown_null'
  END AS cohort,
  COUNT(*)::int AS runs,
  COUNT(*) FILTER (
    WHERE gt.created_at >= timestamptz '2026-07-03T14:30:00Z'
      AND gt.preview_success IS TRUE
  )::int AS ready,
  COUNT(*) FILTER (
    WHERE gt.created_at >= timestamptz '2026-07-03T14:30:00Z'
      AND gt.preview_success IS FALSE
  )::int AS failed,
  COUNT(*) FILTER (
    WHERE gt.created_at >= timestamptz '2026-07-03T14:30:00Z'
      AND gt.preview_success IS NULL
  )::int AS pending
FROM generation_telemetry gt
WHERE gt.created_at > now() - interval '14 days'
  AND gt.scaffold_id IS NULL
GROUP BY 1
ORDER BY runs DESC;
```

**A2. Feltyper bara inom `imported_repo`-chattar** (error_logs / preview-meddelanden) — inte hela 14d-blandningen.

**A3. Canvas-copy:** byt “ingen scaffold matchad” → “ingen scaffold registrerad – blandad kohort” tills A1 är körd.

### Steg B — Mätning i `control-stats` (kod)

- Utöka `byScaffold` / ny sektion: null-rader uppdelade som ovan.
- Tri-state per kohort (ready/failed/pending), aldrig bara ready/runs.
- Ingen ny DB-modell — använd `scaffold_selection_method` + `edit_kind='imported_repo'`.

### Steg C — Fixa Scaffold: Av → `projekt-bas-app` (klart i branchen)

- Klient skickar `scaffoldMode: "off"` (bugfix: utelämnades tidigare → auto).
- Server (`resolve-base` + create-chat pre-match) mappar Av → `projekt-bas-app`.
- Template/`importedRepoMode` förblir scaffold-null.
- Tester: `orchestrate-scaffold-off.test.ts`.

### Steg D — Template-stabilitet (vänta på A)

Först när A visar failed (inte bara pending) i `imported_repo`:

- Smala preserve-first-reparationer (deps, lockfile-stale, ev. hydration) — **ingen** scaffold-merge.
- Styrt av faktiska toppfel i den kohorten.

### Steg E — Koppla ägarens bas-stomme (senare)

När Av-knappen funkar: peka fritext+Av mot den minimala stommen (eller behåll `buildCompleteProject` som interim). Template-vägen förblir orörd.

## Explicit icke-mål (nu)

- Syntetisk scaffold som filinjektion på templates
- Bred template-refactor utan kohortbevis
- Ny dashboard-yta i builder

## Klarmål för denna plan

- [ ] A1–A2 körda mot prod, siffror inklistrade här eller i canvas
- [ ] B merged (eller ekvivalent rapportskript)
- [ ] C merged med tester
- [ ] D endast om A visar riktiga failures i import-kohorten
- [ ] E efter ägarens stomme + Av-fix
