# Scaffold-bindning och hygien

**Status:** genomförande mot `preview`. Ingen ny katalog, inga nya
autofixregler, ingen live 10-sajts-omkörning.

**Bas:** `origin/preview`. Worktree: `/sajtmaskin-scaffold-bindning`
(`cursor/scaffold-binding-3525`).

Evalen 16 sep (Nordlunden, samma prompt, scaffold låst) och GPT-coachen
visade att ett manuellt butik-/app-val inte var strukturellt bindande, och
att app-shell kunde bli landning även i `structural`. Augusti-spåret
[scaffold-komposition och städ](../../avklarat/2026-08-21-scaffold-komposition-och-stad/00-master-plan.md)
är redan levererat.

## I den här PR:n

1. Init + `manual` + `siteKind !== "marketing"` → `structural`. Auto, Av och
   manuella marketing-scaffolds behåller `inspirational` om context inte är
   `heavy`.
2. Structural-texten: explicit val behåller arkitektur; briefen får inte
   kollapsa den till landning.
3. Init-`variantHintId` från pre-match är inte lås. Bara Byggval Stil och
   follow-up-lock.
4. Självklara filbuggar i `files/` (app-shell-namn/ikoner, ecommerce-länk,
   saas-token, meta-copy). Inga nya rutter eller Clerk-gate.

## Utanför — annan agent / annan owner

Nordlunden-reparationerna (164 autofix, Luna/Terra, contact-form,
`fake_form`, FormEvent+toast, live-review-receptbyte, Chromium-dump,
postcheck-transport) ägs **inte** här — separat lokal agent.

**Auth-tidbox:** `auth-pages/files/` har ingen `middleware.ts` och ingen
`/api/protected`-route. Preview-failen (`canStartPreview=true`, clerk-auth,
middleware mot saknad handler, Fly-boot) är inte scaffold-ägd. Parkeras mot
preview-host / clerk-F2-stub / `SM-071`. Ingen fix i den här PR:n.

Disabled addenda återöppnas inte.

## Verifiering

`npm run typecheck`, `npm run scaffolds:validate`, riktat Vitest, sedan
`npm run verify:pr -- --plan`.
