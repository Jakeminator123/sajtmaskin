---
name: Prompt-system forbattringar
overview: Forbattringar av prompt-systemet for battre v0-generering. Scope-medvetenhet, components.json-fix, och framtida spec-fil.
todos:
  - id: scope-detection-brief
    content: "KLART: Brief-systemprompten ar nu scope-medveten (enkel prompt -> one-pager, komplex -> multi-page)"
    status: completed
  - id: intent-guidance-scope
    content: "KLART: BUILD_INTENT_SYSTEM_GUIDANCE for website uppdaterad med scope- och shadcn-guidning"
    status: completed
  - id: promptassist-scope
    content: "KLART: promptAssist.ts website-intent uppdaterad med scope- och shadcn-instruktioner"
    status: completed
  - id: fix-components-json
    content: "KLART: Fixat components.json OCH systempromptar -- style 'new-york' (inte 'new-york-v4'), korrekt baseColor, aliases, registries"
    status: completed
  - id: spec-file
    content: "Implementera persistent sajtmaskin.spec.json per projekt -- genereras fran wizard/audit/freeform, pushas till v0, lases automatiskt"
    status: pending
  - id: auto-lock-spec
    content: "Utoka automatisk fillasning: las spec-fil automatiskt vid push till v0-projekt"
    status: pending
isProject: false
---

# Prompt-system forbattringar

## Genomforda andringar

### 1. components.json -- fixat felaktig konfiguration (KRITISKT)
**Filer:** `components.json`, `src/lib/builder/defaults.ts`, `src/lib/builder/promptAssist.ts`

Projektet hade `"style": "new-york-v4"` i components.json -- detta ar INTE giltigt enligt shadcn/ui-schemat.
Schema-validering visar att giltiga varden ar: "default", "new-york", "radix-vega", "radix-nova", etc.

**Andrat:**
- `components.json`: style `"new-york-v4"` -> `"new-york"` (korrekt for Tailwind v4)
- `components.json`: registries format uppdaterat till `{name}` placeholder
- `defaults.ts`: Systemprompten matchar nu exakt den faktiska components.json
- `promptAssist.ts`: shadcn-referensen uppdaterad

**Referens:** https://ui.shadcn.com/docs/components-json
- For Tailwind v4: lamna `tailwind.config` tom
- Style: `"new-york"` (default har deprecerats)
- baseColor: "slate" (korrekt)

**NOTERA:** `new-york-v4` FINNS kvar i `v0-url-parser.ts` och `init-registry/route.ts` -- dessa ar registry API-URL:er (URL-sokvagar), INTE components.json-config. De ar korrekta.

### 2. Scope-medveten brief-generering
**Fil:** `src/app/api/ai/brief/route.ts`

Brief-systemprompten anpassar nu antalet sidor baserat pa promptens komplexitet:
- Kort prompt -> polerad one-pager med 4-6 sektioner
- Detaljerad prompt -> multi-page brief (2-5 sidor)
- Default: farre sidor med hogre kvalitet

### 3. Scope-medveten build intent guidance
**Fil:** `src/lib/v0/v0-generator.ts`

Website-intentens guidning inkluderar nu scope-matchning och explicit shadcn/ui-instruktion.

### 4. Forbattrad website-intent i promptAssist
**Fil:** `src/lib/builder/promptAssist.ts`

Tva nya instruktionsrader: scope-matchning och shadcn/ui for interaktiva element.

---

## Kommande forbattringar

### 5. Persistent spec-fil per projekt
**Prioritet: HOG**

Wizard/audit/freeform-flodet avslutas med att generera en `sajtmaskin.spec.json` som pushas till v0-projektet och lases.

### 6. Auto-lasning av spec-fil
**Prioritet: MEDEL**

Nar spec-filen pushas ska den automatiskt lasas i v0-projektet.

---

## Beslut

- **Build intent**: Behall "website" som default. "App" ar for avancerat for enkla hemsidor.
- **shadcn/ui**: On-demand (v0 hanterar imports). Installera inte alla komponenter.
- **designSystemId**: Framtida mojlighet for per-kund-branding via custom registry.
- **components.json style**: `"new-york"` ar korrekt for bade Tailwind v3 och v4. Skillnaden hanteras via `tailwind.config` (tom for v4).
