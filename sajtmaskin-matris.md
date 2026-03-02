# Jämförelse: React/Node/Next/JS-stack vs WordPress m.fl. (småföretag)

> Den här versionen är **viktad för småföretagssajter** där man prioriterar **prestanda, SEO, spårning, integrationer och framtida vidareutveckling** – vilket typiskt gynnar **Next.js/React + Node**.  
> Om ditt huvudmål istället är “billigast och enklast redaktör direkt”, tenderar WordPress/Webflow/Wix att vinna.

---

## Vad man bygger med React/Node/Next (”JS-stack”)

Typiska styrkor:
- **Interaktiva företagssajter**: tydliga call-to-actions, komplexa formulär, offertflöden, bokning, medlems-/kundportaler.
- **Hög prestanda + bra UX**: SSR/SSG/ISR i Next.js för snabba sidor och bra Core Web Vitals.
- **Integrationer**: CRM (HubSpot), e-post (Mailchimp), analytics, tag manager, betalning, bokning, PIM/ERP, webhooks.
- **Komponentbaserat UI**: design-system, återanvändbara komponenter, A/B-testning, personalisering.
- **Mer “produkt”-känsla**: en sajt som kan växa till webbapp utan total omskrivning.

Typiska nackdelar:
- Mer **teknikval/arkitektur** (hosting, caching, CMS, auth, observability).
- Redaktörsflöden kräver ofta **headless CMS** (t.ex. Sanity/Contentful/Strapi) eller att man bygger enklare admin.

---

## WordPress och andra sätt att bygga hemsidor

### WordPress (tema + plugins)
Styrkor:
- Väldigt bra för **redaktörer** och innehåll: sidor, bloggar, landningssidor, formulär.
- Stort plugin-ekosystem och många byråer/utvecklare.

Svagheter:
- Prestanda och säkerhet beror mycket på **tema, plugins, hosting och uppdateringsdisciplin**.
- Större risk för “plugin-soppa” i längden om man bygger mycket special.

### Webflow / Wix / Squarespace
Styrkor:
- Snabbt att få upp en snygg sajt, ofta bra för **små företag** som vill lansera fort.
- Hosted och relativt låg driftbörda.

Svagheter:
- Begränsad “app-anpassning” jämfört med egen kodbas.
- Låsnings-/plattformskostnader kan bli tydligare över tid.

### Shopify
Styrkor:
- Om du säljer: **e-handel** med hög stabilitet, säkerhet och bra ekosystem.
- Snabbt till produktion.

Svagheter:
- Löpande kostnad och vissa anpassningar kräver Shopify-specifika upplägg.

### Static (Astro/Hugo) + Git-baserat CMS
Styrkor:
- Extremt bra **prestanda och säkerhet**, ofta billigt att drifta.
- Perfekt för dokumentation/landningssidor.

Svagheter:
- Redaktörsupplevelse och “app”-funktioner kräver mer setup.

---

## “Hur vanligt är det?” (andelar, inte “bäst”)

Dessa siffror är från W3Techs och ändras över tid:

| Plattform/teknik | Andel av alla webbplatser |
|---|---:|
| WordPress (CMS) | 42.6% |
| Shopify (CMS) | 5.1% |
| Wix (CMS) | 4.2% |
| Webflow (CMS) | 0.9% |
| React (JS library) | 6.2% |
| Next.js (JS library) | 2.3% |

Källor:
- W3Techs WordPress: https://w3techs.com/technologies/details/cm-wordpress
- W3Techs Shopify: https://w3techs.com/technologies/details/cm-shopify
- W3Techs Wix: https://w3techs.com/technologies/details/cm-wix
- W3Techs Webflow: https://w3techs.com/technologies/details/cm-webflow
- W3Techs React: https://w3techs.com/technologies/details/js-react
- W3Techs Next.js: https://w3techs.com/technologies/details/js-nextjs
- Översikter: https://w3techs.com/technologies/overview/content_management och https://w3techs.com/technologies/overview/javascript_library

Obs: CMS-andelar och “JS library”-andelar är olika kategorier – jämför dem som indikativa mått, inte samma “marknad”.

---

## Jämförelsematris (10 parametrar) – **viktad för småföretag (JS-favoriserad)**

**Poäng (0–100)** = *lämplighetspoäng* för typiska småföretagssajter som vill kunna växa, integrera och mäta.  
**Vikter** summerar till 100 och ger en **viktad total**.

### Parametrar och vikter (JS-favoriserade)
1. Dev-hastighet (**8**)  
2. Redaktör/CMS (**6**)  
3. Prestanda (**14**)  
4. SEO (**12**)  
5. App-anpassning (**15**)  
6. Skalbarhet (**10**)  
7. Säkerhet (**9**)  
8. Underhåll (**8**)  
9. Kostnad (**8**)  
10. Ekosystem (kompetens, bibliotek, leverantörer) (**10**)  

### Matris (poäng i %)
| Alternativ | Dev-hast (8) | CMS (6) | Perf (14) | SEO (12) | App (15) | Skala (10) | Säk (9) | Underh (8) | Kost (8) | Eko (10) | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Next.js (React)** | 80 | 65 | 92 | 92 | 95 | 90 | 88 | 78 | 70 | 90 | **86** |
| Headless WP + Next.js | 70 | 95 | 92 | 92 | 92 | 88 | 80 | 62 | 60 | 92 | 84 |
| Static (Astro/Hugo) + Git CMS | 72 | 60 | 96 | 92 | 70 | 96 | 96 | 82 | 85 | 75 | 83 |
| Shopify | 82 | 88 | 78 | 82 | 75 | 88 | 92 | 88 | 55 | 92 | 82 |
| Server-rendered MVC (Django/Laravel/Rails) | 70 | 65 | 82 | 86 | 88 | 82 | 82 | 78 | 70 | 82 | 80 |
| React SPA + Node API | 70 | 45 | 85 | 70 | 95 | 88 | 85 | 72 | 70 | 85 | 79 |
| Webflow | 88 | 88 | 78 | 82 | 60 | 78 | 88 | 88 | 65 | 65 | 77 |
| WordPress (tema + plugins) | 85 | 95 | 60 | 82 | 70 | 72 | 55 | 60 | 85 | 95 | 74 |
| Wix/Squarespace | 92 | 82 | 68 | 72 | 50 | 68 | 88 | 92 | 70 | 65 | 72 |

### Tolkning
- Med dessa vikter hamnar **Next.js (React)** högst eftersom den är stark på **prestanda, SEO, app-anpassning, säkerhet och långsiktig vidareutveckling**.
- **Headless WP + Next.js** blir ofta “sweet spot” när du vill ha en **riktig redaktörsupplevelse** men ändå behålla Next-frontens fördelar.
- **WordPress** vinner ofta om du ökar vikten på **Redaktör/CMS** och **Kostnad** och sänker “App-anpassning”.

---

## Praktisk rekommendation för småföretag

### När Next.js/React + Node passar bäst
- Du vill bygga **mer än en broschyrsajt**: lead-gen + integrationer + mätning + personalisering.
- Du vill ha **max kontroll** över design/UX och kunna iterera snabbt med A/B-testning.
- Du vill ha en teknikbas som kan växa till **kundportal / webbapp**.

### När WordPress/Webflow/Wix kan vara bättre
- Du vill ha **max enkel redigering**, många innehållssidor och minimal utvecklingsinsats.
- Teamet saknar utvecklarresurser och vill ha en mer “allt-i-ett”-lösning.

---

## React-komponent (för att visa matrisen på din Next/Vercel-sajt)

Klistra in som `components/SiteTechMatrix.tsx` och importera på valfri sida.

```tsx
import React from "react";

type Param = {
  key: string;
  label: string;
  weight: number; // 0..100, summerar till 100
};

type Option = {
  key: string;
  label: string;
  scores: Record<string, number>; // paramKey -> 0..100
};

const params: Param[] = [
  { key: "dev_speed", label: "Dev-hastighet", weight: 8 },
  { key: "editor_cms", label: "Redaktör/CMS", weight: 6 },
  { key: "performance", label: "Prestanda", weight: 14 },
  { key: "seo", label: "SEO", weight: 12 },
  { key: "app_custom", label: "App-anpassning", weight: 15 },
  { key: "scaling", label: "Skalbarhet", weight: 10 },
  { key: "security", label: "Säkerhet", weight: 9 },
  { key: "maintenance", label: "Underhåll", weight: 8 },
  { key: "cost", label: "Kostnad", weight: 8 },
  { key: "ecosystem", label: "Ekosystem", weight: 10 },
];

const options: Option[] = [
  {
    key: "next",
    label: "Next.js (React)",
    scores: {
      dev_speed: 80,
      editor_cms: 65,
      performance: 92,
      seo: 92,
      app_custom: 95,
      scaling: 90,
      security: 88,
      maintenance: 78,
      cost: 70,
      ecosystem: 90,
    },
  },
  {
    key: "wp_headless_next",
    label: "Headless WP + Next.js",
    scores: {
      dev_speed: 70,
      editor_cms: 95,
      performance: 92,
      seo: 92,
      app_custom: 92,
      scaling: 88,
      security: 80,
      maintenance: 62,
      cost: 60,
      ecosystem: 92,
    },
  },
  {
    key: "static",
    label: "Static (Astro/Hugo) + Git CMS",
    scores: {
      dev_speed: 72,
      editor_cms: 60,
      performance: 96,
      seo: 92,
      app_custom: 70,
      scaling: 96,
      security: 96,
      maintenance: 82,
      cost: 85,
      ecosystem: 75,
    },
  },
  {
    key: "shopify",
    label: "Shopify",
    scores: {
      dev_speed: 82,
      editor_cms: 88,
      performance: 78,
      seo: 82,
      app_custom: 75,
      scaling: 88,
      security: 92,
      maintenance: 88,
      cost: 55,
      ecosystem: 92,
    },
  },
  {
    key: "mvc",
    label: "Server-rendered MVC (Django/Laravel/Rails)",
    scores: {
      dev_speed: 70,
      editor_cms: 65,
      performance: 82,
      seo: 86,
      app_custom: 88,
      scaling: 82,
      security: 82,
      maintenance: 78,
      cost: 70,
      ecosystem: 82,
    },
  },
  {
    key: "react_node",
    label: "React SPA + Node API",
    scores: {
      dev_speed: 70,
      editor_cms: 45,
      performance: 85,
      seo: 70,
      app_custom: 95,
      scaling: 88,
      security: 85,
      maintenance: 72,
      cost: 70,
      ecosystem: 85,
    },
  },
  {
    key: "webflow",
    label: "Webflow",
    scores: {
      dev_speed: 88,
      editor_cms: 88,
      performance: 78,
      seo: 82,
      app_custom: 60,
      scaling: 78,
      security: 88,
      maintenance: 88,
      cost: 65,
      ecosystem: 65,
    },
  },
  {
    key: "wp",
    label: "WordPress (tema + plugins)",
    scores: {
      dev_speed: 85,
      editor_cms: 95,
      performance: 60,
      seo: 82,
      app_custom: 70,
      scaling: 72,
      security: 55,
      maintenance: 60,
      cost: 85,
      ecosystem: 95,
    },
  },
  {
    key: "wix",
    label: "Wix/Squarespace",
    scores: {
      dev_speed: 92,
      editor_cms: 82,
      performance: 68,
      seo: 72,
      app_custom: 50,
      scaling: 68,
      security: 88,
      maintenance: 92,
      cost: 70,
      ecosystem: 65,
    },
  },
];

function weightedTotal(option: Option): number {
  const total = params.reduce((acc, p) => {
    const score = option.scores[p.key] ?? 0;
    return acc + score * (p.weight / 100);
  }, 0);
  return Math.round(total);
}

export default function SiteTechMatrix() {
  const sorted = [...options].sort((a, b) => weightedTotal(b) - weightedTotal(a));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 1100, width: "100%" }}>
        <thead>
          <tr>
            <th style={thStyle}>Alternativ</th>
            {params.map((p) => (
              <th key={p.key} style={thStyle}>
                {p.label} ({p.weight})
              </th>
            ))}
            <th style={thStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((opt) => (
            <tr key={opt.key}>
              <td style={tdStyleLeft}>{opt.label}</td>
              {params.map((p) => (
                <td key={p.key} style={tdStyleCenter}>
                  {opt.scores[p.key]}
                </td>
              ))}
              <td style={{ ...tdStyleCenter, fontWeight: 700 }}>{weightedTotal(opt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        Poängen är “lämplighetspoäng” (0–100). Ändra vikter och poäng efter dina behov.
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "center",
  border: "1px solid #ddd",
  padding: "8px",
  background: "#f7f7f7",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyleCenter: React.CSSProperties = {
  textAlign: "center",
  border: "1px solid #ddd",
  padding: "8px",
  whiteSpace: "nowrap",
};

const tdStyleLeft: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #ddd",
  padding: "8px",
  whiteSpace: "nowrap",
};
```

---

## Snabbt: så gör du ännu mer “React vinner”
Om du vill att matrisen ska bli ännu mer JS-favoriserad:
- höj vikten för **Prestanda / SEO / App-anpassning / Säkerhet / Ekosystem**
- sänk vikten för **Redaktör/CMS** och **Dev-hastighet**
- ge Next högre “CMS”-poäng om du ändå planerar headless CMS (Sanity/Contentful/Strapi)

