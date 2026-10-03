# A4 — CTA, handoff och ärlig copy

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: copy kan börja direkt. Handoff-flaggor följer A1-wrappern.

## Uppdrag

Sluta lova gratis analys som kostar credits. Efter rapport: tydlig väg
till konto och/eller builder, med befintlig
`extractAuditHandoffPayload` — inte en ny builder-pipeline.

## Problemet

[`entry-modal.tsx`](../../../../../src/components/modals/entry-modal.tsx)
`ENTRY_MODES.audit.subtitle`:

> «Ange din webbadress och få en kostnadsfri AI-analys med konkreta
> förbättringsförslag — helt gratis.»

API och widget tar 15/25 credits och 401 utan session. Startsidans
sektion är mer ärlig («Logga in för att använda audit-funktionen») men
partner-`?mode=audit` kan visa entry-modalen först
([`use-entry-params.ts`](../../../../../src/lib/entry/use-entry-params.ts)).

Efter lyckad audit gör [`src/app/page.tsx`](../../../../../src/app/page.tsx)
`extractAuditHandoffPayload` → `createProject` → `POST /api/prompts` →
builder. `AuditModal` har primär CTA «Bygg förbättrad sida», plus Spara
(`POST /api/audits` → `saveUserAudit`) och PDF/JSON utan auth-gate i UI.

På en publik `/analys` är «Bygg…» och «Spara» meningslösa eller lögn
för en gäst (båda API:erna kräver inloggning).

`analyserad` är wizard («AI ställer frågor») i
[`landing-chat-data.ts`](../../../../../src/components/landing-v2/landing-chat-data.ts).
Copy på `/analys` får inte kalla flödet «analyserad».

## Uppgift

### Copy (första, oberoende av B1)

1. Stryk «helt gratis» / «kostnadsfri AI-analys» ur entry-modalens
   audit-läge.
2. Texten ska matcha B1:
   - G1: «En grundanalys per dygn utan konto. PDF och bygge kräver
     konto.» (exakt formulering fri, innebörden inte.)
   - G2: «Logga in. Grundanalys 15 credits, avancerad 25.»
   - G3: säg vad som är öppet och vad som låses.
3. Title/H1 på `/analys` (A1) får inte säga gratis om G2 gäller.
4. Rör inte `welcome-overlay.tsx` («helt gratis» där = autogenererad
   *sajt*, annan yta).

### Wrapper-CTA på `/analys`

Flaggor på `AuditModal` / sidan, inte ny modal:

| Handling | Gäst (G1-default) | Inloggad |
|---|---|---|
| Se scores / förbättringar | Ja | Ja |
| PDF / JSON | Signup-CTA | Befintlig `AuditPdfReport` |
| Spara | Signup-CTA (`saveUserAudit` kräver user) | `POST /api/audits` |
| Bygg förbättrad sida | Signup, sedan samma handoff | `extractAuditHandoffPayload` som på `/` |

Återanvänd `onRequireAuth` / `onBuildFromAudit`. Auto-overlay
«Bygg ny sida från auditen?» ska inte slå upp för gäst.

### Efter signup

Handoff-payloaden är synkron ur `AuditResult`. Om gästen just kört G1
finns resultatet i klientstate — efter konto: samma
`extractAuditHandoffPayload` + ev. `saveUserAudit`. Bygg inte
server-to-server «återuppliva gästaudit» i v1 (ingen anonym
`user_audits`-rad, se A2-stopp).

Sekundär CTA på landningen: `/builder?new=1` eller `/skapa-hemsida`,
inte en tredje generator.

### Partner och nav (efter B3/B4)

- B3 ja: länk «Analys» i landing-nav och/eller footer
  ([`navbar-footer-links.test.tsx`](../../../../../src/components/landing-v2/navbar-footer-links.test.tsx)).
- B4 nej i fas 1: `?mode=audit` stannar på `/`. Flytt till `/analys`
  är separat, så partner-QA inte blandas med första PR.
- App-nav «Audits» → `/audits` oförändrad.

## Gränser

- Ingen ny handoff-typ. Återanvänd
  [`audit-handoff.ts`](../../../../../src/lib/builder/audit-handoff.ts).
- Ingen auto-start av generation från lead magneten.
- Ingen copy som blandar `/analys` med wizard-läget `analyserad`.
- Ingen ändring av `SEO_LANDING_CTA_HREF`.

## Klart när

- Sök i repo: audit-entry lovar inte «helt gratis» / «kostnadsfri»
  analys.
- Gäst på `/analys` ser signup — inte en död Spara/Bygg-knapp som 401:ar.
- Inloggad handoff är samma som dagens `handleBuildFromAudit`.
- Tester: entry-modal-copy (ny eller utökad), ev. modal-flaggor,
  befintliga `audit-handoff.test.ts` och
  `audit-modal.save-state.test.tsx` fortfarande gröna.

## Stopp

Pausa om någon vill persistera gästrapporter utan konto, eller om CTA
ska starta init-generation utan separat creditsbeslut.
