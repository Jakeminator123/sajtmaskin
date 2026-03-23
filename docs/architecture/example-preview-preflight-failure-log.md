# Exempel: preview OK men fel i loggpanelen

Det här dokumentet beskriver ett **verkligt mönster** från buildern: *own-engine-preview* kan rendera framgångsrikt medan **post-checks, preflight och sandbox–quality gate** fortfarande rapporterar fel och varningar. Det är **inte motsägelsefullt** — de mäter olika saker.

## Varför preview kan vara grön ändå

| Lager | Vad det gör | Typiskt resultat |
| --- | --- | --- |
| **Own-engine preview** | Bygger en begränsad HTML/JS-vy i iframe från sparade filer | `renderSuccess: true` per route |
| **Lokal preflight** | Statiska kontroller (routes, SEO-heuristik, CSS-varningar, m.m.) | Varningar/errors i loggen |
| **Quality gate (sandbox)** | `tsc` / `next build` i Vercel Sandbox mot scaffold + dina filer | Kan faila även om previewn visar något vettigt |
| **Navigation / quality gate (lokalt)** | T.ex. `invalid_link_import` om `Link` importerats från `lucide-react` men används som `next/link` | Fel som **autofix** (`repairGeneratedFiles` → `link-import-fixer`) ofta kan rätta vid nästa sparning |

## Tolka panelens radsammanfattning

Exempel: **13 loggar, 4 fel, 4 varningar, 5 info** — felen kommer ofta från **quality gate** (sandbox typecheck/build) plus **lokal quality gate** (`invalid_link_import`), medan info-raderna kan vara flera **“Preview rendered successfully”** (en per iframe-läge/route).

## Exempelutdrag från fel- / telemetrilogg

Nedan: struktur som i UI:t (datum/tider kan variera). JSON är för korthet något formaterat; se källan i appen för exakt schema.

### Sammanfattning (som användaren såg)

- **SEO review:** varningar (canonical, OG-bild, robots, sitemap, saknad h1 på startsidan).
- **navigation:** `Felaktig Link-import` i `components/home/hero-section.tsx` → motsvarar `qualityGateFailures: invalid_link_import`.
- **css:** många varningar i `app/globals.css` (validering), inte nödvändigtvis preview-blockerande.
- **preflight:** `previewBlocked: false` — preview får köra trots övriga anmärkningar.
- **quality-gate (sandbox):** `typecheck` exit 2, `build` exit 1; **tom `output`** kan förekomma om sandbox-kommandot inte returnerar stdout/stderr till API:t. I `src/app/api/v0/chats/[chatId]/quality-gate/route.ts` läggs en **platshållartext** in när utdata saknas och kommandot ändå fallerade.

### `render-telemetry` (info, upprepas per route)

```json
{
  "source": "own-engine",
  "demoUrl": "/api/preview-render?chatId=<chatId>&versionId=<versionId>&route=%2F",
  "renderSuccess": true,
  "scaffoldContext": {
    "scaffoldId": "base-nextjs",
    "scaffoldLabel": "Base Next.js",
    "scaffoldFamily": "base-nextjs",
    "persistedOn": "engine_chat"
  }
}
```

### `quality-gate:typecheck` (error)

```json
{
  "output": "",
  "exitCode": 2,
  "scaffoldContext": { "scaffoldId": "base-nextjs", "scaffoldLabel": "Base Next.js" }
}
```

*(Om `output` är tom sträng: kör `npx tsc --noEmit` / `npx next build` lokalt mot samma filuppsättning, eller använd autofix-prompten.)*

### `preflight:quality-gate` (error)

```json
{
  "passed": false,
  "checks": [
    { "check": "typecheck", "passed": false, "exitCode": 2 },
    { "check": "build", "passed": false, "exitCode": 1 }
  ],
  "sandboxDurationMs": 55309,
  "scaffoldContext": { "scaffoldId": "base-nextjs" }
}
```

### `navigation` + lokal `quality-gate` (varning / error)

```json
{
  "files": ["components/home/hero-section.tsx"],
  "message": "Felaktig Link-import upptackt."
}
```

```json
{
  "failures": ["invalid_link_import"],
  "message": "Quality gate failed after generation."
}
```

### Användarmeddelande i panelen

> Den här versionen har fel loggade. Kör autofix om du vill skicka en reparationsprompt baserad på de senaste problemen.

Det syftar på att sammanfoga **senaste fel/varningar** till en **uppföljningsprompt** — inte att previewn automatiskt är trasig.

## Se även

- [Follow-up prompts, komponenter och preview](follow-up-prompts-components-and-preview.md)
- [Engine status](engine-status.md)
- [Known issues and fixes](known-issues-and-fixes.md) (om autofix och gate beteende uppdateras där)
