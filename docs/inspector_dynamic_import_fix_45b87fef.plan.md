---
name: Inspector dynamic import fix
overview: Lägger till en separat monkey-patch-funktion i proxy-preview som fångar dynamiskt skapade script-element (Next.js code-splitting) och omdirigerar deras src till den riktiga vusercontent.net-originen. Byggs som en egen funktion med feature-flag så den enkelt kan stängas av.
todos:
  - id: build-patch-fn
    content: Skapa funktionen buildDynamicScriptPatch(origin) i route.ts som monkey-patchar createElement för script och link[modulepreload]
    status: completed
  - id: inject-in-pipeline
    content: Injicera den nya patchen i HTML-pipeline (efter buildOriginPatchScript), med nodynamic query-param flag
    status: completed
  - id: verify-no-regression
    content: Kontrollera att filen kompilerar utan fel (readlints)
    status: completed
isProject: false
---

# Inspector: fix för svart sida (dynamiska imports)

## Problemet i korthet

När du trycker "Inspektionsläge" proxas v0-sidan genom `/api/proxy-preview`. Den hämtar HTML:en och serverar den från localhost. Befintliga patchar fixar:

- `<base>`-tagg -- statiska `src`/`href` i HTML
- `fetch()`-patch -- JS-anrop som `fetch("/_next/...")`
- `XMLHttpRequest`-patch -- äldre requests

Men **Next.js App Router skapar `<script>`-element dynamiskt** via JavaScript för att ladda code-split chunks. Dessa nya script-element får `src="/..."` som pekar på localhost istället för vusercontent.net. Resultatet: chunks 404:ar, sidan blir svart.

## Lösningen

Monkey-patcha `document.createElement` så att varje nyskapat `<script>`-element automatiskt omskriver sin `src` till den riktiga originen. Tänk det som en "vakt vid dörren" -- varje gång Next.js säger "hämta `/\_next/chunk-xyz.js`" fångar vi det och ändrar till `https://demo-xxx.vusercontent.net/_next/chunk-xyz.js`.

```
Next.js: createElement("script") -> script.src = "/_next/chunk.js"
                                          |
                                    [vår patch fångar]
                                          |
                                    script.src = "https://demo-xxx.vusercontent.net/_next/chunk.js"
```

## Ändringar

En fil ändras: [src/app/api/proxy-preview/route.ts](src/app/api/proxy-preview/route.ts)

### 1. Ny funktion: `buildDynamicScriptPatch(origin)`

Skapas som en **separat funktion** (inte inbakad i `buildOriginPatchScript`) vid rad ~416 så den enkelt kan tas bort eller kommenteras ut. Funktionen genererar ett `<script>`-block som:

- Sparar originalet av `document.createElement`
- Overridar det med en wrapper
- När `tag === "script"`: interceptar `.src`-propertyn med en setter som omskriver `/...`-URLs till den riktiga originen
- Hanterar även `<link rel="modulepreload">` (som Next.js App Router ibland använder)
- Alla andra element passerar igenom oförändrade

### 2. Injicera patchen i pipeline (rad ~510)

Lägg till anropet direkt efter befintliga `buildOriginPatchScript`:

```typescript
const dynamicScriptPatch = buildDynamicScriptPatch(target.origin);
// inject alongside origin patch, just before </head>
```

### 3. Feature-flag via query parameter

Lägg till `?nodynamic=1` som stänger av den nya patchen. Gör det enkelt att A/B-testa i webbläsaren utan kodändring:

- `/api/proxy-preview?url=...` -- med patch (default)
- `/api/proxy-preview?url=...&nodynamic=1` -- utan patch (fallback)

## Vad som INTE ändras

- Inspektorn (`inspectorScript`) -- orörd
- `buildOriginPatchScript` -- orörd (fortfarande aktiv)
- `PreviewPanel.tsx` -- orörd
- Sandbox-läget -- opåverkat

## Återställning

Om det inte fungerar: ta bort/kommentera ut anropet till `buildDynamicScriptPatch` i pipeline-sektionen (en rad). Funktionen kan ligga kvar som dead code eller tas bort helt.
