# Sajtmaskin — repo-router

Detta är repo-rotens **snabba ingång** för människor och LLM:er som arbetar i `master`.

Syftet är inte att duplicera hela `docs/`, utan att ge en stabil **första orientering** över det committade trädet. Kod är alltid source of truth.

> Galler den **committade** versionen av repot pa `master` per **2026-04-24** (efter master-post-cleanup Wave 5 + 11 hot-fixes — se taggen `MILSTOLPE-2026-04-24-master-cleanup-wave5`). Lokala, ocommittade eller privata filer kan finnas utan att synas har.

## Borja har

1. Denna fil — snabb repo-router.
2. [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md) — kanonisk rotkarta.
3. [`docs/README.md`](docs/README.md) — dokumentationsnav.
4. [`.cursor/README.md`](.cursor/README.md) — Cursor-regler, slash-kommandon och arbetsflode.
5. Valj sedan en domanspecifik ingang nedan.

## Snabb karta

| Plats | Roll |
|------|------|
| `src/` | Next.js-app, API-routes, UI och domanlogik. |
| `src/lib/gen/` | Delad genereringskarna: orchestration, prompts, autofix, finalize, verifier, previewforberedelser. |
| `src/lib/own-engine/` | Own-engine-boundary och session-/streamrelaterad motorlogik. |
| `src/lib/providers/own-engine/` | Providerkopplingar och den produktbanan for egen motor. |
| `preview-host/` | Tier-2 preview-host / runtime / verify / workspace-livscykel. |
| `docs/` | Kanoniska manskliga docs och arkitekturtexter. |
| `config/` | Kanonisk konfiguration: modeller, env-policy, promptfragment, dashboard-kartor. |
| `scripts/` | Hjapskript for dev, db, eval, env, scaffolds, template-library m.m. |
| `templates_v0/` | Lokalt mall-/katalogarv. Inte den primara produktbanan for runtimegenerering. |
| `.cursor/` | Cursor-regler, lokala kommandon och agentorientering. |

## Router per uppgift

### Om du felsoker eller andrar LLM-flodet

Borja i denna ordning:

1. [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md)
2. [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md)
3. `src/lib/gen/`
4. `src/lib/providers/own-engine/`
5. `src/lib/own-engine/`

**Tumregel:**
- Delad pipeline och efterbehandling = `src/lib/gen/`
- Provider-/motorinkoppling = `src/lib/providers/own-engine/`
- Boundary, sessioner, engine-specifik logik = `src/lib/own-engine/`

### Om du jobbar med preview / VM / runtime

Borja i denna ordning:

1. [`docs/architecture/fas3-preview-and-deploy.md`](docs/architecture/fas3-preview-and-deploy.md)
2. `preview-host/`
3. `src/lib/gen/preview/`
4. `src/components/builder/preview-panel/`
5. `src/lib/builder/preview-session/`

### Om du jobbar med builder-UI eller chat

Borja i denna ordning:

1. `src/app/builder/`
2. `src/components/builder/`
3. `src/lib/hooks/chat/`
4. `src/components/ai-elements/`

### Om du jobbar med deploy

Borja i denna ordning:

1. [`docs/architecture/fas3-preview-and-deploy.md`](docs/architecture/fas3-preview-and-deploy.md)
2. `src/app/api/v0/deployments/route.ts`
3. `src/lib/deploy/`
4. `src/lib/vercelDeploy*`
5. `src/lib/project-env-resolver*`

### Om du jobbar med env eller konfiguration

Borja i denna ordning:

1. [`docs/ENV.md`](docs/ENV.md)
2. `src/lib/env.ts`
3. `config/env-policy.json`
4. `config/README.md`

### Om du jobbar med templates, scaffolding eller katalogdata

Borja i denna ordning:

1. `src/lib/gen/scaffolds/`
2. `src/lib/gen/template-library/`
3. `scripts/scaffolds/`
4. `scripts/template-library/`
5. `templates_v0/` endast om du uttryckligen felsoker arv, import eller katalogunderlag

## Viktiga lasregler for agenter

- Kod gar fore docs om de skiljer sig.
- Denna fil ar en **router**, inte en fullstandig arkitekturbeskrivning.
- Om en lokal README finns i det omrade du ror, las den innan du andrar strukturen.
- Anvand `docs/architecture/repo-tree.md` som kanonisk rotkarta.
- Behandla `templates_v0/` och kvarvarande `v0`-namn som **legacy eller naming debt** tills kod visar annat.

## Rekommenderad Cursor-ingang

For Cursor/agentarbete:

1. Denna `README.md`
2. [`AGENTS.md`](AGENTS.md)
3. [`.cursor/README.md`](.cursor/README.md)
4. [`.cursor/rules/repo-router.mdc`](.cursor/rules/repo-router.mdc)
5. Den domanspecifika regel eller dokumentfil som matchar uppgiften

## Fordjupning

- Dokumentationsnav: [`docs/README.md`](docs/README.md)
- Repo-trad: [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md)
- Arkitekturindex: [`docs/architecture/README.md`](docs/architecture/README.md)
- Cursor-nav: [`.cursor/README.md`](.cursor/README.md)
- Agentpekare: [`AGENTS.md`](AGENTS.md)
