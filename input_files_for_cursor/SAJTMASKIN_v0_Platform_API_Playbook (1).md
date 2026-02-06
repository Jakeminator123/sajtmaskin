# Sajtmaskin – v0 Platform API Playbook (för Cursor-agent)
Version: 2026‑02‑05 (Europe/Madrid)

Det här dokumentet är en praktisk “operatörshandbok” för hur du bygger en Loveable/white‑label webbsidebyggare med **v0 Platform API** som kodmotor – med fokus på **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** och en promptstrategi som är stabil, billig och lätt att automatisera.

---

## 0) Grundidé: separera **regler**, **spec**, **uppgift**
Du vill undvika att “systemprompten blir annorlunda” bara för att sajten råkar ha 3 bilder. Lösningen är att alltid dela upp kontexten i tre lager:

1) **Systemprompt (stabil, samma hela tiden)**  
   Regler för stack, kodstil, hur ändringar ska göras, format, inga extra dependencies, osv.

2) **Projekt‑spec (per kund/projekt, uppdateras vid behov)**  
   “Vad sajten är”: sidor, copy, tonalitet, färger, assets (t.ex. exakt vilka 3 bilder), CTA, kontaktinfo.

3) **Task‑prompt (varje iteration)**  
   “Vad som ska göras nu”: byt hero‑bilden, lägg till testimonials, fixa ett fel, osv. Små diffar.

**Tänk så här:**  
- *System* = hur du jobbar  
- *Spec* = vad sajten är  
- *Task* = vad som ska ändras nu

---

## 1) Rekommenderad arkitektur (Sajtmaskin → v0)
### 1.1 Flöde i produkten (Loveable “Loveable/Lovable”-stil)
1. **Onboarding wizard / chat** samlar in input (företagsinfo, mål, tonalitet, sidor, assets).
2. Du kompilerar allt till en **kort, tydlig** `sajtmaskin.spec.json`.
3. Du initierar en v0‑chat med en **starter template** + spec‑fil (gärna låst).
4. Du skickar en första “bygg”-task via `sendMessage`.
5. Varje ändringsönskemål blir en **ny** `sendMessage` med minimal instruktion.
6. Du hämtar preview/export via **versions** och **download**.

### 1.2 v0 “objekt” du jobbar med
- **Project**: container för relaterade chats och instruktioner.
- **Chat**: konversationen som genererar kod.
- **Version**: varje generering/iteration skapar en ny version (preview + files + status).
- **Files + locks**: du kan låsa viktiga filer så AI inte ändrar dem.

---

## 2) Hur mycket ska du “förbereda” när du kör Platform API?
### Rekommendation: **Nivå B (bäst för produkt)**
Du förbereder EN gång per kund/projekt:

- En liten **starter template** (Next + Tailwind + shadcn + dina “golden components”).
- En **spec-fil** (kundens beslut).
- Lås vissa filer (config + design tokens + golden components).

Sedan itererar du med små tasks. Du behöver inte “skicka hela stacken” varje gång – den ligger i filerna + chatten.

---

## 3) Starter template: filstruktur + låsstrategi
### 3.1 Minimal struktur (för frontendsajter)
Exempel (anpassa):
```
/app
  layout.tsx
  page.tsx
  /(marketing)
    about/page.tsx
    services/page.tsx
    contact/page.tsx
/components
  /sajtmaskin
    Container.tsx        (LOCK)
    Section.tsx          (LOCK)
    Header.tsx           (LOCK)
    Footer.tsx           (LOCK)
    typography.tsx       (LOCK)
  ui/                    (shadcn)
/lib
  brand.ts               (LOCK)  // tokens: färger, radius, fonts
  seo.ts                 (LOCK)  // helpers för metadata
/public
  (valfritt: lokala assets)
sajtmaskin.spec.json     (LOCK)
tailwind.config.ts       (LOCK)
tsconfig.json            (LOCK)
package.json             (LOCK)
```
**Poängen:** AI får “lekutrymme” i sidor/sektioner, men din grund är stabil.

### 3.2 Vad ska låsas?
**Lås nästan alltid:**
- `package.json`, `tsconfig.json`, `tailwind.config.ts`
- dina design tokens / brand‑config (`/lib/brand.ts`)
- dina “golden components” som du vill återanvända (Container/Section/Header/Footer)

**Lås ibland:**
- globala CSS om du vill undvika att AI ändrar typografi/spacing

**Låt vara olåst:**
- `/app/**` sidor (AI ska kunna bygga/iterera)
- nya komponenter under `/components/blocks/**` eller liknande

---

## 4) Systemprompt (Sajtmaskin‑standard)
Kopiera/klistra (anpassa ordval):
```text
Du är Sajtmaskins kodagent. Du genererar och uppdaterar kod i ett Next.js App Router-projekt med TypeScript.
Styling: Tailwind CSS. UI: shadcn/ui-komponenter när det passar.

REGLER
- Följ sajtmaskin.spec.json som “source of truth”. Om spec saknas: fråga efter den.
- Gör minsta möjliga ändring. Rör inte filer som är låsta.
- Lägg inte till nya dependencies utan att uttryckligen fråga först.
- Behåll befintlig filstruktur och kodstil. Undvik onödiga refactors.
- När du ändrar: ange tydligt vilka filer du ändrade och visa fullständigt innehåll för ändrade filer.
- Om du måste skapa nya filer: skapa dem under /components/blocks eller /app enligt konvention.
- Om du är osäker: ställ EN konkret fråga och föreslå default.

OUTPUT
- Returnera ändrade filer med tydliga rubriker per fil och kodblock med korrekt indentering.
```

---

## 5) Projekt‑spec: `sajtmaskin.spec.json`
### 5.1 Minimal spec (för företagshemsidor)
Exempel:
```json
{
  "version": "1.0",
  "business": {
    "name": "Kund AB",
    "industry": "konsult",
    "tagline": "Vi hjälper företag att ...",
    "tone": "professionell, varm, tydlig",
    "languages": ["sv-SE"]
  },
  "theme": {
    "primary": "#0B5FFF",
    "radius": "md",
    "font": "system"
  },
  "pages": [
    { "id": "home", "path": "/", "sections": ["hero", "services", "testimonials", "cta", "faq"] },
    { "id": "about", "path": "/about", "sections": ["story", "team", "values"] },
    { "id": "services", "path": "/services", "sections": ["service_list", "process", "cta"] },
    { "id": "contact", "path": "/contact", "sections": ["contact_form", "details", "map_placeholder"] }
  ],
  "assets": {
    "images": [
      { "id": "hero", "url": "https://example.com/hero.jpg", "alt": "Beskrivande alt-text" },
      { "id": "team", "url": "https://example.com/team.jpg", "alt": "Teamet på Kund AB" },
      { "id": "office", "url": "https://example.com/office.jpg", "alt": "Kontoret" }
    ],
    "logo": { "url": "https://example.com/logo.svg", "alt": "Kund AB logotyp" }
  },
  "content": {
    "cta": { "primaryText": "Boka ett möte", "href": "/contact" },
    "contact": {
      "email": "info@kundab.se",
      "phone": "+46 70 123 45 67",
      "address": "Exempelgatan 1, 111 11 Stockholm"
    }
  },
  "constraints": {
    "maxImages": 3,
    "noNewDependencies": true
  }
}
```

---

## 6) Promptmönster (Tasks) som ger stabila diffar
### 6.1 Första “bygg”-tasken (efter init)
```text
Bygg en företagshemsida enligt sajtmaskin.spec.json.

KRAV
- Skapa sidor enligt specens pages (paths).
- Använd endast de 3 bilderna i spec.assets.images (ingen fjärde bild).
- Använd shadcn/ui för formulär och UI där det passar.
- Gör det responsivt (mobile-first) och tillgängligt (aria/labels).
- Rör inte låsta filer.
- Lägg inte till nya dependencies.

LEVERANS
- Ange vilka filer du skapat/ändrat.
- Visa full kod för ändrade filer.
```

### 6.2 Ändring: “byt hero-bild” (minimal ändring)
```text
Ändra endast hero-bilden.
- Ny URL: https://.../new-hero.jpg
- Uppdatera alt-text.
- Behåll layout, copy och övriga bilder oförändrade.
- Rör inga andra sektioner/filer än nödvändigt.
```

---

## 7) v0 Platform API: praktiskt användningsmönster
- Initiera med starter template + specfil (gärna låst)
- Kör första build via sendMessage
- Iterera med små tasks
- Hämta senaste version + exportera

---

## 8) Kostnad & stabilitet: praktiska regler
1. Spec i fil, inte i prompt varje gång.
2. Små tasks (en ändring per prompt).
3. Lås hårt det som inte får ändras.
4. Be modellen visa endast ändrade filer.
