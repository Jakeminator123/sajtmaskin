# Iframe sandbox security fixes

## Problem

Chrome DevTools visar varningen:
> "An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing."

Varningen triggas i **inspektionsläget** i buildern (när "Inspektionsläge"-knappen är aktiv).

## Varför uppstår det?

Det finns två separata källor till varningen:

### Källa 1 – PreviewPanel.tsx (vår kod)

I normalläge pekar iframens `src` direkt på `https://demo-xxx.vusercontent.net` — cross-origin,
ingen risk. Men när inspektionsläget aktiveras pekar `src` istället på `/api/proxy-preview?url=...`
som serveras från **samma origin** som appen (localhost / sajtmaskin.se). Då gör kombinationen
`allow-scripts + allow-same-origin` att skript inuti iframen kan komma åt parent-dokumentet.

### Källa 2 – v0:s genererade HTML (tredjepartskod)

v0:s demo-sidor kan innehålla egna `<iframe>`-element med `sandbox="allow-scripts allow-same-origin"`.
Dessa plockas upp av proxyn och serveras som en del av HTML:en vi returnerar.

## Fixar

### Fix 1 – Villkorligt sandbox-attribut i PreviewPanel.tsx

`src/components/builder/PreviewPanel.tsx` rad ~585:

```tsx
sandbox={
  isInspectorMode
    ? "allow-scripts allow-forms allow-popups"           // proxy mode – tar bort allow-same-origin
    : "allow-scripts allow-same-origin allow-forms allow-popups"  // direkt vusercontent.net
}
```

Inspector-scriptet i proxyn använder bara `window.parent.postMessage()` vilket fungerar
cross-origin utan `allow-same-origin`. Funktionaliteten påverkas inte.

### Fix 2 – Strippa allow-same-origin i proxy-pipeline

`src/app/api/proxy-preview/route.ts` — ny funktion `removeAllowSameOriginFromSandboxes()`:

```typescript
function removeAllowSameOriginFromSandboxes(html: string): string {
  return html.replace(
    /(sandbox=["'])([^"']*)(["'])/gi,
    (_match, pre, value, post) => {
      const cleaned = (value as string)
        .split(/\s+/)
        .filter((t) => t !== "allow-same-origin")
        .join(" ")
        .trim();
      return `${pre}${cleaned}${post}`;
    },
  );
}
```

Appliceras tidigt i HTML-pipeline:
```typescript
html = removeCsp(html);
html = removeAllowSameOriginFromSandboxes(html);  // <-- ny rad
html = neutralizeEmbeds(html);
```

Är harmlöst för nested iframes i proxad HTML — de har ändå inget behov av
same-origin-tillstånd när de körs via proxy.

## Sannolikhet att varningen försvinner

- **Fix 1 ensam**: ~60% (tar bort vår egen varning, men inte v0:s)
- **Fix 1 + Fix 2**: ~85% (täcker statiska `sandbox`-attribut i HTML)
- **Kvarvarande 15%**: JavaScript som dynamiskt skapar iframes via `iframe.sandbox.add('allow-same-origin')` — kan inte fångas med regex på HTML

## Relaterat: asm.js-varningen

```
Invalid asm.js: Unexpected token
```

Kommer från v0:s kompilerade Next.js-chunks. Är en ofarlig browser-nivå-informationslogg
(webbläsaren försökte JIT-kompilera som asm.js, misslyckas, faller tillbaka till normal JS).
Går **inte** att åtgärda — det är v0:s bundlad kod.
