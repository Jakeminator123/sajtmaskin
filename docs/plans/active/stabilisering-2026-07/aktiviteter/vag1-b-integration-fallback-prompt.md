# Agent-prompt — Våg 1-B: Integration-fallback i genererade sajter (B1, smarthet 7/10)

Kopieras rakt in i en builder-agent. Reserverar `data/dossiers/hard/{stripe-checkout,resend-contact-form}/**` + `src/lib/integrations/tier3-build-spec.ts`. Rör INTE `src/lib/gen/autofix/**`/`verify/**` (ägs av Våg 1-A).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/stabilisering-vag1-integration-fallback`, leverera EN PR mot master.

MISSION: Genererade sajter ska degradera SNYGGT när en integrations env-nycklar saknas. I prod-sessionen 2026-07-03 (chat `cc10e7de`) klickade ägaren på Stripe-betalknappen i den genererade sajten och fick ett rått fel. Dossier-kontraktet finns redan på pappret: `data/dossiers/hard/stripe-checkout/instructions.md` kräver "If STRIPE_SECRET_KEY is missing … render the button in a disabled state with a 'Configure Stripe to enable payments' tooltip" och API-routen returnerar redan 503 — men klientkomponenten `checkout-button.tsx` implementerar det INTE (den kastar `Checkout failed (503)` som rå text). Resend-dossiern har 503-kontraktet på route-sidan men samma klient-gap. Ditt jobb: implementera kontraktet, som en standardiserad, återanvändbar komponent i dossier-koden.

LÄS FÖRST: `AGENTS.md`, `.cursor/rules/dossier-rules.mdc`, `docs/contracts/scaffold-system.md` (dossier-avsnittet), `data/dossiers/hard/stripe-checkout/{manifest.json,instructions.md,components/**}`, `data/dossiers/hard/resend-contact-form/{manifest.json,instructions.md,components/**}`, `src/lib/integrations/tier3-build-spec.ts` (`renderTier3BuildPlanBlock`), `src/lib/integrations/registry.ts` (`setupGuide`-fälten).

NULÄGE (kodverifierat):
- `stripe-checkout/components/api/checkout-session/route.ts` (motsv.): 503 om `STRIPE_SECRET_KEY` saknas — bra, behåll.
- `stripe-checkout/components/checkout-button.tsx`: fetch → `if (!res.ok) throw` → rå `text-destructive`-rad. Inget disabled-state, ingen konfig-copy.
- `resend-contact-form/api/contact/route.ts`: 503 + `email-not-configured` om nycklar saknas; instructions kräver "calm 'not yet configured' message" i formuläret.
- `registry.ts` har `setupGuide`-text per provider (t.ex. Stripe: "Logga in på dashboard.stripe.com…").
- F3-prompten (`renderTier3BuildPlanBlock`) säger idag "assume real values are present at runtime" — ingen instruktion om graceful UX.

UPPGIFTER:

1. Delad komponent `IntegrationConfigNotice` i dossier-koden.
   - En liten client-komponent (per dossier eller delad fil som båda dossiers `files[]` injicerar — följ dossier-systemets mekanik, runtime läser BARA `data/dossiers/{hard,soft}/`) som renderar en lugn notis i sajtens egen stil (Tailwind, neutral/muted, INTE error-röd): rubrik + 1–2 meningar svensk copy + env-nyckelnamnen + länk.
   - Copy-mall (anpassa per integration): "Betalningar är inte aktiverade ännu. För att ta emot betalningar behöver sajten kopplas till Stripe — ange env-nyckeln `STRIPE_SECRET_KEY` (den fungerar som ett lösenord). Läs mer: [Stripe-dashboard/setup-länk]". Motsvarande för Resend/kontaktformulär.
   - Länken: använd registrys `setupGuide`-information/dokumenterad URL per provider; hårdkoda i dossier-komponenten (genererade sajter har inte tillgång till Sajtmaskins registry i runtime).

2. `checkout-button.tsx`: implementera instructions-kontraktet.
   - 503/`payments-not-configured`-svar från routen → rendera `IntegrationConfigNotice` + disabled knapp-state, INTE rå feltext. Övriga fel (nätverk, 500) behåller kort feltext men utan att exponera råa statuskoder för slutkund.
   - Låt routen returnera en igenkännbar felkod i JSON-bodyn (t.ex. `{ error: "payments-not-configured" }`) om den inte redan gör det — klienten ska inte gissa på statuskod ensam.

3. `resend-contact-form`: samma mönster i formulärkomponenten (503/`email-not-configured` → notis, disabled submit).

4. F3-promptens buildInstructions (`tier3-build-spec.ts`).
   - Uppdatera `renderTier3BuildPlanBlock` så modellen instrueras: "Every integration CTA (payment/email/etc.) must handle the not-configured response from its API route by rendering the provided config-notice component — never a raw error." Kort, deterministiskt, ingen ny prompt-sektion — utöka den befintliga blockets rader.
   - Verifiera att dossier-verbatim-reglerna (`system-prompt/sections/dossiers.ts`) inte behöver ändras (dossier-filerna ÄR verbatim — nya filer följer med automatiskt via `files[]`).

5. Dossier-hygien.
   - Uppdatera `manifest.json` (`files[]`, ev. `summary`) + `instructions.md` för båda dossiers så text och kod är i synk (docs ska spegla koden, inte tvärtom).
   - Kör `npm run dossiers:validate-all`; regenerera capability-map vid behov (`npm run dossiers:capability-map:write`).

STOPPREGLER:
- Ändra INTE F2-mute, tier3-sdk-guard, `detect-integrations.ts` eller finalize-flödet — bara dossier-filer + tier3-build-spec-text.
- Ingen ny env-nyckel, ingen ny auth/rate-limit (repo-regel).
- Inline-frågorna i builder-chatten (`CompactToolParts`) rörs inte av detta paket (Våg 1-C äger den ytan).
- Svensk copy i genererade sajter (målgruppen är svenska SMB); inga secrets/nyckelvärden i copyn — bara nyckelNAMN.

TESTER & VERIFIERING:
- Dossier-koden är verbatim-filer — testbar via komponent-/route-tester om mönster finns, annars: `npm run dossiers:validate-all` grönt + `npm run typecheck` + `npm run lint`.
- `npx vitest run src/lib/integrations/` (tier3-build-spec-testerna) → grönt; lägg test på den nya buildInstructions-raden.
- Manuell verifiering beskrivs i PR-body: förväntat beteende med/utan `STRIPE_SECRET_KEY`.

PR-KRAV:
- Titel: `feat(dossiers): stabilisering våg 1 — graceful integration-fallback (config-notis i stripe/resend-dossiers + F3-promptkontrakt)`
- Body: före/efter-beteende, copy-texterna, dossier-valideringsutfall, bug-postcheck dokumenterad med triage.
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] `IntegrationConfigNotice` (eller motsv.) i båda hard-dossiers, injicerad via `files[]`
- [ ] Stripe-CTA + Resend-formulär: not-configured → lugn svensk notis + disabled state, aldrig rå feltext
- [ ] Routes returnerar igenkännbar felkod i body
- [ ] F3-buildInstructions kräver mönstret för alla integration-CTA:er
- [ ] `dossiers:validate-all` + typecheck + lint + riktade vitest gröna; instructions/manifest i synk
- [ ] Bug-postcheck dokumenterad i PR
