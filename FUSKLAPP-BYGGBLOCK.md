# Fusklapp: Byggblock (dossiers) — begreppen på en sida

> Kortaste korrekta modellen: **Prompt → capability → dossier → kod i användarsajten.**
> Gruppen hjälper människan att hitta. Capabilityn styr valet. Dossiern är det som byggs in.
>
> Denna lapp innehåller **medvetet inga antal** (antal dossiers, capabilities osv.) — de driftar.
> Aktuell katalog: `data/dossiers/{hard,soft}/` eller backoffice → Byggblock.

## Hierarkin, visuellt (auth som exempel)

```mermaid
flowchart TD
    G["GRUPP (UI-rubrik)<br/>”Inloggning &amp; konton”<br/><i>styr aldrig valet — bara sortering</i>"]
    G --> C["CAPABILITY (behovet)<br/><code>auth</code><br/><b>routingnyckeln</b> briefen ber om"]
    C --> D1["DOSSIER = Byggblock<br/><code>clerk-auth</code><br/>standardval (default) för capabilityn"]
    C --> D2["DOSSIER = Byggblock<br/><code>supabase-auth</code><br/>leverantörssyskon — väljs vid<br/>uttrycklig ”supabase” i prompten"]
    D1 --> P1["PROVIDER (extern tjänst)<br/>Clerk"]
    D2 --> P2["PROVIDER<br/>Supabase"]
```

- **Dossier-familj** = syskonen under samma capability (`clerk-auth` + `supabase-auth` är auth-familjen).
  Pedagogiskt ord — inget manifestfält. Exakt en i familjen är `defaultForCapability`.
- **Provider** = den externa tjänsten en **Kopplad** (`hard`) dossier ansluter till. Deklareras i `manifest.providers`.
- **Fristående** (`soft`) dossiers har ingen deklarerad integrationsprovider eller hemlighet. De kan använda
  lokala filer, publika nyckelfria resurser och **teknik** (npm-bibliotek som Embla, MapLibre, MiniSearch).
  Teknik är ett beroende, inte en leverantör.

## Orden — vad de är och inte är

| Ord | Är | Är INTE |
|---|---|---|
| Capability | Behovet/funktionen sajten ska ha (`auth`, `payments`) — det briefen ber om | En implementation |
| Dossier / Byggblock | Ett kuraterat implementationsrecept för en capability (manifest + instruktioner + filer) | En mall/template |
| Dossier-familj | Alla dossiers under samma capability | Ett fält i något schema |
| Provider | Extern tjänst med konto/nycklar (Clerk, Stripe, OpenAI) | Ett npm-paket |
| Teknik | Lokalt bibliotek i en Fristående dossier (Embla, Three.js) | En provider |
| Grupp/kategori | UI-rubrik som sorterar rader i panelen och backoffice | Något som påverkar vilket byggblock som väljs |
| Template (v0-mall) | Komplett färdig sajt i galleriet — separat system | En dossier |
| Scaffold | Runtime-startpunkt/grundstruktur för genererade sajter | En dossier eller mall |

## De tre oberoende axlarna (vanligaste felläsningen)

Ingen av dessa kan härledas ur någon annan:

| Axel | Fråga | Värden | Ägare |
|---|---|---|---|
| Klass | Har implementationen en deklarerad provider-/integrationskoppling? | Kopplad (`hard`) / Fristående (`soft`) | mappen `data/dossiers/{hard,soft}/` |
| Demoläge | Hur beter sig ytan i designläget utan livekonfiguration? | `canned` / `seed` / `success` / `visual` / `none` | `manifest.mock` |
| Kräver integrationsbygge | Måste riktiga integrationen byggas i eget steg? | ja / nej | `dossierRequiresF3()` — build-nyckel ELLER serverfil |

Exempel på oberoendet: `vercel-analytics` är Kopplad men kräver **inte** integrationsbygge.
`stripe-checkout` kräver integrationsbygge pga sin **serverfil** — inte pga nyckeln (den är `feature-runtime`).

## Vad ett manifest innehåller

Obligatoriskt: `id` (= mappnamnet), `label`, `capability` (exakt en), `codeFidelity`
(`verbatim` = byte-exakt / `rewritable` = får anpassas), `complexity`, `summary`, `lastVerified`.
Kopplade dossiers måste dessutom ha `providers` och (nästan alltid) `mock`.

Valfritt: `envVars[]` (med `enforcement` och `setupUrl`), `dependencies` (npm), `files[]`
(med `role: client/shared/server`), `exposes` (komponenter LLM:en får importera),
`summarySv` (svensk UI-text), `relevanceKeywords` (uttrycklig leverantörsträff),
`defaultForCapability`. Fullt schema: [`docs/schemas/strict/dossier.schema.json`](docs/schemas/strict/dossier.schema.json).

## Nycklarnas tre kravnivåer (`envVars[].enforcement`)

| Nivå | UI-ord | Betyder |
|---|---|---|
| `build` | krävs | Utan riktigt värde/godkänd placeholder stoppas ”Bygg integrationer” (innan kostnad) |
| `feature-runtime` | vid användning | Bygget går igenom; funktionen kör demo tills värdet sparas |
| `warn-only` | valfri | Funktionen stänger av sig själv tyst utan värde |

## Demolägen (vad besökaren ser i designläget utan livekonfiguration)

| `mock` | Besökaren får |
|---|---|
| `canned` | Trovärdigt påhittat svar (t.ex. förberedd chattström) |
| `seed` | Medskickad exempeldata + diskret notis |
| `success` | Formulär går igenom med ärlig demo-notis — inget skickas |
| `visual` | Full yta; handlingen öppnar ärlig demo-ruta i stället för riktig operation |
| `none` | Ingen demo-yta — självavstängning eller konfigurationsnotis |

## Status i Byggblock-panelen (per version, rapportering — inte deploybevis)

`Planerad` → `Blockerad — nyckel krävs` → `Byggd — demo aktiv` → `Byggd — live`, samt
`Inkopplad` för det som är klart utan integrationsrunda. Ägare: `resolveDossierLifecycle()`.

## Beroenden mellan capabilities

En capability som bara fungerar med en följeslagare kan dra in den automatiskt
(`expandDependentCapabilities` i `select.ts`). Tabellen är **tom** i dag — mekanismen
finns kvar för framtida behov. Auth behöver t.ex. ingen databas-capability:
Kopplade auth-dossiers har sina användare hos providern (Clerk/Supabase), och
databas är en egen capability med eget byggblock.

## Vart sanningen bor

| Fakta | Kanonisk ägare |
|---|---|
| Allt om ett byggblock | `data/dossiers/<klass>/<id>/manifest.json` |
| Vilka som väljs och varför | `src/lib/gen/dossiers/select.ts` |
| Kräver integrationsbygge-regeln | `dossierRequiresF3()` i `src/lib/gen/dossiers/types.ts` |
| Svenska UI-orden | `src/lib/builder/dossier-axes.ts` (+ spegel i backoffice) |
| Statusregeln | `src/lib/gen/dossiers/lifecycle.ts` |
| Grupperna | `src/lib/builder/dossier-groups.ts` |
| Hela kontraktet i prosa | [`docs/contracts/dossier-system.md`](docs/contracts/dossier-system.md) |

Denna fusklapp är en läskarta, inte en sanningskälla — driftar den mot koden vinner koden.
