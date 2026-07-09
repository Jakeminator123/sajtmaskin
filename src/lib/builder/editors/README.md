# Section editors

Dessa moduler driver builderns **kodläges-editorer** (Hero, Tjänster, Omdömen,
FAQ, Team, Priser, Nav, Stats, Produkter, Kategorier, Blogg, Footer, Kontakt).
Varje modul läser strukturerat innehåll ur en genererad sida (`read*Draft`) och
skriver tillbaka ändringar (`update*Draft`) genom **teckenpositioner** (ranges),
inte via en fullständig AST-parser.

## Kritisk invariant: fångster får inte korsa objekt-/array-gränser

Editorerna skrapar källkod med regex. En generad sida innehåller ofta **flera
syskon-arrayer vars objekt delar inledande nyckel** — t.ex. en meny
`{ name, price }` bredvid omdömen `{ name, role, quote }` bredvid ett team
`{ name, role, bio }`. En girig fångst (`([\s\S]*?)`) kan då backtracka förbi ett
objekts slut och **svälja en helt annan array** in i första fältet.

> **Prod-incident (Kaffehörnan, 2026-07-09):** Omdömes-editorns `name`-fält
> innehöll `Espresso", price: "36 kr" }, { name: "Cappuccino"...` — hela menyn
> hade läckt in. Eftersom spara-vägen är positionsbaserad kunde detta även
> **korrumpera filen** vid spara.

### Det säkra mönstret

Använd en **bunden fångst** som sväljer escapade tecken men aldrig passerar ett
oescapat avslutande citattecken (backreferensen till delimitern):

```
(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1
   │        │            │
   │        │            └─ …men aldrig förbi ett OESCAPAT delimiter-tecken (\1)
   │        └─ svälj escapade tecken (\' \" \\ \n) så de inte avbryter fältet
   └─ öppnande delimiter fångas i en grupp så \1 matchar rätt sort (" ' `)
```

- `(?:\\[\s\S] | (?!\1)[\s\S])*?` — non-greedy, escape-medveten, delimiter-bunden.
- För komponent-attribut (`<PricingCard … />`) binds även *mellanrummen* mellan
  attribut med `(?:(?!\/>)[\s\S])*?` så en kort-tagg inte slukar nästa kort.

Två subtila fel som mönstret undviker samtidigt:

| Fel | Symptom |
| --- | --- |
| `([\s\S]*?)` (girig, obunden) | Syskon-array läcker in i fältet + filkorruption vid spara |
| `((?:(?!\1)[\s\S])*?)` (bunden men ej escape-medveten) | Fält med `What\'s included?` slutar matcha → item försvinner tyst / fel rad sparas |

## Regel för nya editorer

1. Spegla det säkra mönstret ovan för varje citerat fält.
2. **Lägg till ett fall i [`section-editors-invariants.test.ts`](./section-editors-invariants.test.ts)** —
   den matar in en fientlig sida med nio överlappande arrayer och kräver att din
   editor bara läser sin egen data (inget `{`/`}` eller främmande nyckel läcker).
3. Lägg minst ett enhetstest med **escapade citattecken** i ditt fälts värde.

Verifiering: `npx vitest run src/lib/builder/editors` (per-editor + invariant) och
`node scripts/dev/check-unicode-regex.mjs` (regex mot svensk text).
