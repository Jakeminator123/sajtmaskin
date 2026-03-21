# Workflow: ladda ner, referera, klon — och var det hamnar

Tre spår i stället för ett: **installera lite i appen**, **spara research som dossiers**, **klona tunga saker tillfälligt utanför (eller gitignored) repo**.

## Beslutsträder

### A. Ladda in i appen (riktig kod)

**När:** liten komponentkod, tydligt kompatibel med er stack, något ni vill använda i **Sajtmaskin-builderns UI nu**.

**Hur:** officiella **shadcn/ui**-komponenter via CLI (`add`), inte genom att kopiera hela externa projekt.

**Var i repo:**

| Innehåll | Mapp |
|----------|------|
| shadcn/ui-bas | `src/components/ui/` (eller motsvarande enligt `components.json`) |
| Sammansatta byggar-block | `src/components/builder/blocks/` (om ni inför det) |
| Builder-specifik UI | `src/components/builder/` |

**Förslag på första komponenter att lägga till:**  
`button`, `card`, `input`, `textarea`, `select`, `dialog`, `dropdown-menu`, `sheet`, `tabs`, `table`, `form`, `command`, `navigation-menu`, `popover`, `calendar` (prioritera efter vad buildern faktiskt behöver).

### B. Referera och dossiera (inte direkt runtime)

**När:** sektioner, animationer, stora blockbibliotek, “wow”-marketing, dashboards som inspirationskälla.

**Exempel på källor att behandla så här:** Magic UI, Origin UI, 21st.dev (community block), samt utvalda fynd från shadcn.io-kategorierna.

**Föreslagen struktur** (skapa om den inte finns — finns inte automatiskt i alla brancher):

| Syfte | Plats |
|-------|--------|
| Rå discovery (URL, taggar, snabb bedömning, Next-kompatibel?, beslut: download/reference/ignore) | `research/external-templates/raw-discovery/current/catalog.json` (+ ev. `summary.json`) |
| Efter granskning | `research/external-templates/reference-library/dossiers/<slug>/` med t.ex. `notes.md`, utplockade sektioner, “vilken scaffold-familj stärks” |

**Checka inte in** hela externa repos som normal appkod här.

### C. Klon tillfälligt för analys

**När:** fulla SaaS-starters, boilerplates med auth/billing/RBAC, mycket appspecifik logik.

**Exempel:** Next.js SaaS Starter, SaaS Boilerplate — bra för att läsa **route-struktur**, **dashboard-layout**, **auth**, **pricing**, **settings**, **CRUD-mönster**, tomma tillstånd.

**Var:**

- Utanför repo, **eller**
- `tmp/template-imports/` (eller liknande) med **gitignore**

Efter analys: skriv **slutsatser** i ett dossier under `reference-library/dossiers/`, promota bara **destillerade mönster** till `src/lib/gen/scaffolds/<familj>/` och `registry.ts`.

## Shortlist (konkret)

| Åtgärd | Vad |
|--------|-----|
| **Installera nu** | Officiella shadcn/ui-komponenter via CLI |
| **Dossier först** | Magic UI, Origin UI, 21st.dev |
| **Klon tillfälligt** | Next.js SaaS Starter, SaaS Boilerplate |
| **Bara studera** | Radix UI Primitives (a11y/primitives, inte förstahands scaffold-källa) |

## Promota till intern scaffold

| Plats | Innehåll |
|-------|----------|
| `src/lib/gen/scaffolds/<familj>/` | Kuraterad startkod för generering |
| `src/lib/gen/scaffolds/registry.ts` | Registrering av scaffolds |

## Gör inte

- Massnedladdning av repos in i huvudprojektet  
- En scaffold per slumpmässig extern template  
- Research som blir ogranskad runtime  

## Gör

- Få officiella shadcn-komponenter i **Sajtmaskin-appen** där det behövs  
- Använd stora bibliotek som **inspiration + dossiers**  
- Klona tunga starters **kort** för strukturanalys  
- Promota endast **återanvändbara mönster** till interna scaffolds  

## Slutregel

**Ladda ner komponenter. Referera bibliotek. Klon starters tillfälligt. Promota bara destillerat in i egna scaffolds.**
