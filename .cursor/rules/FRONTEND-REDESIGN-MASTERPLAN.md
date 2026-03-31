# FRONTEND REDESIGN — MASTERPLAN

> **Vision:** Apple-minimalism + Google-enkelhet + ChatGPT-UX
> **Regel:** Aldrig ändra backend, API-routes eller dataflöden. Enbart frontend.
> **Färger:** Mörkblå (navy) · Orange · Vit
> **Princip:** Så få ord som möjligt. Allt bakom eleganta flikar/menyer.

---

## FASER (rekommenderad ordning)

### FAS 1 — DESIGNFUNDAMENT (globals.css, tailwind, typografi)

Allting bygger på att färgpaletten och typografin är rätt först. Varje efterföljande
fas ärver dessa tokens automatiskt via CSS-variabler.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 1.1 | Ny färgpalett | `src/app/globals.css` | `--background` → deep navy (~222 40% 15%), `--primary` → orange (~14 90% 60%), `--accent` → muted orange/neutral (bort med teal 152°), `--ring` → orange, `--brand-orange` ny, `--brand-navy` ny, ta bort `--brand-teal` |
| 1.2 | Tailwind-färger | `tailwind.config.cjs` | Lägg till `brand.orange`, `brand.navy`, ta bort `brand.teal`, lägg till `fontFamily.heading: var(--font-heading)` |
| 1.3 | Typografi-sanering | `src/app/layout.tsx` | Ta bort Inter (oanvänd), behåll Geist Sans (body) + Space Grotesk (headings) |
| 1.4 | Sidebar-tokens | `src/app/globals.css` | Mörka `:root` sidebar-variabler till navy (matchar shell) |
| 1.5 | Landing-CSS | `src/styles/landing-v2.css` | Byt teal rgba-orbs/glows → navy+orange, ta bort `.btn-3d` / `.btn-glow` |
| 1.6 | confirm-dialog | `src/components/ui/confirm-dialog.tsx` | Byt hardkodad `gray-900` → `bg-background` (använd tokens) |

**Resultat:** Hela appen byter ton automatiskt — alla shadcn-komponenter, knappar, dialoger, borders.

---

### FAS 2 — NAVIGATION (hamburgarmeny + login-ikon + footer)

Ena navigationen över hela sajten. Bygg tre nya delade komponenter.

| # | Ändring | Fil(er) | Detalj |
|---|---------|---------|--------|
| 2.1 | **NY: SiteNavMenu** | `src/components/layout/site-nav-menu.tsx` | Sheet/Drawer med ALLA nav-länkar (Funktioner, Teknik, Priser, FAQ, Mallar, Projekt, etc.). Delas av landing + app-sidor |
| 2.2 | **NY: HeaderActions** | `src/components/layout/header-actions.tsx` | Högerkluster: `[Kom igång gratis – outline]` `[Login-ikon]` `[Hamburgare-ikon]`. Guest vs authed-state |
| 2.3 | Landing-navbar | `src/components/landing-v2/navbar.tsx` | Ta bort synliga desktop-länkar, ersätt med SiteNavMenu + HeaderActions. Behåll logotyp vänster |
| 2.4 | App-navbar | `src/components/layout/navbar.tsx` | Samma mönster: logotyp + HeaderActions + SiteNavMenu. Ta bort desktop text-nav |
| 2.5 | Login → ikon | Båda navbars | `Button variant="ghost" size="icon"` med `LogIn`-ikon + `aria-label="Logga in"`. Authed: avatar/User-ikon → dropdown (Projekt, Credits, Logga ut) |
| 2.6 | CTA-knapp | Båda navbars | "Kom igång gratis" = `variant="outline"` med orange border/text. Diskret men synlig. Ej 3D/glow |
| 2.7 | **NY: MinimalFooter** | `src/components/layout/minimal-footer.tsx` | EN rad: logotyp + Integritet + Villkor + © 2026. Ersätter BÅDE `footer.tsx` OCH `landing-footer.tsx` |
| 2.8 | Beta-banner | `src/components/layout/beta-banner.tsx` | Ikon-only med tooltip, eller en rad max. Ta bort gradient + lång text |
| 2.9 | Cookie-banner | `src/components/layout/cookie-banner.tsx` | Minimal bottom bar: "Acceptera" + "Inställningar". Ta bort Pac-Man |

**Resultat:** En konsekvent, minimalistisk header+footer på alla sidor.

---

### FAS 3 — HERO & LANDINGSSIDA

Från ~660 rader scrollbar marketing till en ren, fokuserad upplevelse.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 3.1 | Hero-text | `src/components/landing-v2/landing-hero.tsx` | EN headline (~6 ord) + EN subtitle (~12 ord). Ta bort: pill-badge, rotating types, lång subhead, stats-rad, "Scrolla ned" |
| 3.2 | Hero-input | `landing-hero.tsx` | Stor textarea centrerad. Lägesval som ikon-rad eller dropdown (ej 5 chips med beskrivningar). Default till "Analyserad"-läge |
| 3.3 | Proaktiv copy | `landing-hero.tsx` + `landing-chat-data.ts` | Placeholder: "Berätta om ditt företag så tar vi det därifrån" eller "Vi börjar med några frågor" |
| 3.4 | Below-fold → Tabs | `src/components/landing-v2/chat-area.tsx` | Ersätt ~12 sektioner med EN Tabs-komponent: `Översikt \| Funktioner \| Teknik \| Pris`. Lazy-laddade paneler |
| 3.5 | Ta bort default | `chat-area.tsx` | Dölj/ta bort: trust-marquee, jämförelse-radar, counters, terminal-typewriter, lanyard-badge från standardvy |
| 3.6 | Feature-cards | `landing-feature-blocks.tsx` | Behåll kort + modal ("Läs mer") som primärt mönster för dolj detalj. Ta bort inline-paragraphs |
| 3.7 | Copy-sanering | `landing-chat-data.ts` | Halvera eller mer all text i categories, features, techStack, journeySteps, stats, creditPackages |
| 3.8 | Bakgrund | `landing-background.tsx` | Anpassa shader/orbs till navy+orange istället för teal/cyan |
| 3.9 | How-it-works | `landing-how-it-works-lazy.tsx` | Förenkla eller flytta bakom "Hur det fungerar"-tab |
| 3.10 | Bottom CTA | `chat-area.tsx` | Minimal: en mening + en knapp |

**Resultat:** Landningssidan känns som Apple.com — ren, fokuserad, input-first.

---

### FAS 4 — BUILDER/CHAT UI

Gör buildern lika ren som ChatGPT.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 4.1 | Chat-composer | `src/components/builder/ChatInterface.tsx` | Default: textarea + skicka-knapp ONLY. Flytta Skriv om/Plan/Element bakom EN "+" eller "⋯"-meny. Figma/inspect: bakom "Bifoga"-meny |
| 4.2 | Media-meny | `ChatInterface.tsx` | Media/Text/Voice → ChatGPT-stil attachment-meny (gem-ikon) |
| 4.3 | Builder-header | `src/components/builder/BuilderHeader.tsx` | EN primär knapp (Publicera) + overflow "⋯"-meny för: Modell, Mall, Inställningar, Ny chat, Spara, Domän, Mer. Korta alla tooltips till en mening |
| 4.4 | ThinkingOverlay | `src/components/builder/ThinkingOverlay.tsx` | Ta bort roterande FACTS. Ersätt med minimal spinner + "Genererar..." |
| 4.5 | LaunchReadinessCard | `src/components/builder/LaunchReadinessCard.tsx` | Ikon + badge-strip (kollapsad). Expandera vid klick |
| 4.6 | ProjectEnvVarsPanel | `src/components/builder/ProjectEnvVarsPanel.tsx` | Gömd som standard. Öppnas från header-meny eller LaunchReadiness |
| 4.7 | MessageList | `src/components/builder/MessageList.tsx` | Kortare pending-reply-modal (en mening + knappar). Lugn empty state: en rad + ikon |
| 4.8 | TipCard | `src/components/builder/TipCard.tsx` | Av som standard, eller ikon-only. Kortare rubrik |
| 4.9 | Mobil-tabs | `src/app/builder/BuilderShellContent.tsx` | "Chat"/"Preview" → ikoner only på smal skärm |

**Resultat:** Buildern ser ut och känns som ChatGPT med en clean preview vid sidan.

---

### FAS 5 — PREVIEW & TEMPLATE-VAL

Maximera iframe, minimera chrome.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 5.1 | Preview-toolbar | `src/components/builder/PreviewPanel.tsx` | EN slim rad: refresh + öppna extern + "⋯" (kod, inspect, register, element). Ta bort surface-badge, worker-lampa, varnings-paragraphs |
| 5.2 | Route-chips | `PreviewPanel.tsx` | Ersätt med "Sidor"-dropdown |
| 5.3 | Varningar | `PreviewPanel.tsx` | Göm bakom "ℹ️"-ikon när icke-blockerande |
| 5.4 | Empty state | `PreviewPanel.tsx` | En kort rad + en CTA |
| 5.5 | Innehållsredigering | `PreviewPanel.tsx` | Flytta inline-editors till sidebar-tab ("Innehåll") |
| 5.6 | Mall-flik | `src/components/builder/UnifiedElementPicker.tsx` | Sök-först: ett fält, kategorier som filter-dropdown. En scroll (ej sidebar + grid). Dölj match-score |
| 5.7 | Mall-ingång | `ChatInterface.tsx` | Direkt "Mall"-knapp/genväg från composer (ej begravd bakom UI-tab) |
| 5.8 | Template-kort | `src/components/templates/template-gallery.tsx` + `templates/page.tsx` | Titel + antal only. Beskrivning vid hover |
| 5.9 | Preview-modal | `src/components/templates/preview-modal.tsx` | Noll chrome: stäng-knapp + bild |
| 5.10 | Deploy-dialog | `src/components/builder/DeployNameDialog.tsx` | En mening + fält + primär knapp. Credit-info bakom ℹ️ |

**Resultat:** Preview = ren iframe. Mall-val = enkel sök+grid.

---

### FAS 6 — AUTH & ANVÄNDARSIDOR

Minimalistiska modaler och kontroller.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 6.1 | AuthModal | `src/components/auth/auth-modal.tsx` | En kolumn. Placeholder-first (inga synliga labels). Google → primary, email bakom "eller med e-post" (progressive disclosure). Divider: "eller" only. Felmeddelanden: en rad |
| 6.2 | Register-bonus | `auth-modal.tsx` | "+50 credits" som minimal badge, ej lång text |
| 6.3 | RequireAuthModal | `src/components/auth/require-auth-modal.tsx` | En mening per reason + två knappar max |
| 6.4 | Projekt-sida | `src/app/projects/page.tsx` | Minimal header, clean grid. Inga överflödiga labels |

**Resultat:** Auth känns som Googles login — rent, ett steg i taget.

---

### FAS 7 — MARKETING & CONTENT-SIDOR

Minimera textmängd, dölj detaljer bakom accordions.

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 7.1 | /om | `src/app/om/page.tsx` | Minimal trim: kortare intro, behåll kontakt |
| 7.2 | /blogg | `src/app/blogg/page.tsx` | En rad "Kommer snart" + CTA till builder |
| 7.3 | /faq | `src/app/faq/page.tsx` | Ta bort sidebar. Intro: en rad. Behåll accordion Q&As |
| 7.4 | /terms | `src/app/terms/page.tsx` | Varje sektion i Accordion (kollapsbar). Scanbart |
| 7.5 | /privacy | `src/app/privacy/page.tsx` | Samma som terms |
| 7.6 | /buy-credits | `src/app/buy-credits/page.tsx` | Stepper med progressive disclosure. Separera credits vs agency. Kortare copy |
| 7.7 | /templates | `src/app/templates/page.tsx` | Minimal hero. Kort per kategori-kort |
| 7.8 | /category/[type] | `src/app/category/[type]/page.tsx` | Align med builder Mall visuellt. Färre ord |
| 7.9 | Ny redirect | `src/app/priser/` | `/priser` → redirect till `/buy-credits` |
| 7.10 | Footer-byte | Alla sidor | Byt `Footer` och `LandingFooter` → `MinimalFooter` (fas 2.7) |

**Resultat:** Varje sida har max 1-2 synliga stycken. Resten expanderbar.

---

### FAS 8 — OPENCLAW CHATTBUBBLA & HJÄLP-POPUP

Den globala chatten (FAB nere till höger) ska bli en minimal chattbubbla som öppnar
en centrerad popup med en frågetecken-knapp för 40 hands-on hjälpförslag.

**NULÄGE**
- FAB: stort pill med titel "Sajtagenten" + subtitle "AI-hjälp på sajten" + glowing dot + gradient
- Teaser: stort kort med badge, title, body, tags, CTA-knapp (~15 rader text)
- Panel: 380px bred, högerställd, med badge "OpenClaw-assistent", Bot-ikon, assistant-label,
  idle-status, empty-title, empty-body, 3 starter-prompts
- Allt i cyan/purple-gradienter med mycket text

**FILER ATT ÄNDRA**

| # | Ändring | Fil | Detalj |
|---|---------|-----|--------|
| 8.1 | FAB → ren bubbla | `src/components/openclaw/OpenClawChat.tsx` | Ta bort HELA teaser-kortet (rad 187-230). FAB: enbart rund `MessageCircle`-ikon (48x48), inga ord, ingen subtitle, ingen glowing dot. Färg: `bg-brand-orange` eller `bg-primary` med vit ikon |
| 8.2 | Panel → centrerad popup | `OpenClawChat.tsx` | Ändra panelens positionering från höger-bottom till **centrerad** (fixed inset-0 + flex center). Större: ~500-600px bred, ~70vh hög |
| 8.3 | Ta bort teaser-content | `OpenClawChat.tsx` | Radera `teaserTitle`, `teaserBody`, `teaserTags`, `teaserCta`, `showTeaser` logik. Inga teaser-kort |
| 8.4 | Panel-header: minimal | `src/components/openclaw/OpenClawChatPanel.tsx` | Ta bort badge "OpenClaw-assistent", ta bort idle-status, ta bort Bot-ikon-block. Behåll: assistant-namn (kort) + stäng-knapp |
| 8.5 | Empty state: minimal | `OpenClawChatPanel.tsx` | Ta bort lång `emptyBody`. Behåll kort `emptyTitle` (~4 ord). Ta bort Bot-ikon i empty state |
| 8.6 | **NY: Frågetecken-knapp** | `OpenClawChatPanel.tsx` | Lägg till en `HelpCircle`-ikon (lucide) i header. Vid klick: öppna en popup/dialog med 40 hands-on förslag |
| 8.7 | **NY: HjälpFörslagPopup** | `src/components/openclaw/OpenClawHelpSuggestions.tsx` | Dialog/Sheet med 40 förslag i grid (4-5 kolumner, varje förslag i egen box/kort). Klick → skickar förslaget som meddelande. Kategoriserade i grupper |
| 8.8 | Starter prompts | `OpenClawChatPanel.tsx` | Byt 3 starter-prompts → visa "?" ikon som öppnar HjälpFörslagPopup istället. Empty state: en rad text + frågetecken-knapp |
| 8.9 | Färger | `OpenClawChat.tsx` + `OpenClawChatPanel.tsx` | Byt alla cyan/purple-gradienter → navy/orange tokens. Byt `slate-950` → `bg-background`, `cyan-*` → `primary`/`brand-orange` |
| 8.10 | FAB-content defaults | `OpenClawChat.tsx` | Ta bort `fabTitle`, `fabSubtitle` från interface + defaults. FAB har ingen text |

**40 HJÄLPFÖRSLAG (exempel-struktur)**

Förslagen ska vara korta, actionable one-liners i boxar. Grupperade:

- **Komma igång** (8 st): "Skapa en restaurangsida", "Bygg en konsultsajt", "Gör en portfolio", etc.
- **Design & Layout** (8 st): "Byt färgtema", "Lägg till en hero-sektion", "Gör sidan mobilanpassad", etc.
- **Innehåll** (8 st): "Skriv en Om oss-text", "Skapa en FAQ-sektion", "Lägg till prislista", etc.
- **Funktioner** (8 st): "Lägg till kontaktformulär", "Integrera Google Maps", "Lägg till nyhetsbrev", etc.
- **Förbättra** (8 st): "Snabba upp laddningstiden", "Förbättra SEO", "Gör texten mer säljande", etc.

Varje förslag = en klickbar box som skickar texten som chattmeddelande.

---

### FAS 9 — HARDKODADE FÄRGER & POLISH

Sista passet: jaga alla ställen som inte använder CSS-variabler.

| # | Ändring | Fil(er) | Detalj |
|---|---------|---------|--------|
| 9.1 | Builder-klasser | `PreviewPanel.tsx`, `BuilderMessageTooling.tsx`, `VersionHistory.tsx` | Byt `sky-*`, `indigo-*`, `blue-*`, `slate-*` → semantiska tokens (`primary`, `muted`, `border`) |
| 9.2 | Landing 3D | `how-it-works-scene.tsx`, `particle-orb.tsx`, `thinking-spinner.tsx` | Byt teal/cyan hex → navy/orange |
| 9.3 | Shader | `shader-background.tsx` | Byt neon-blå #4F8BFF → orange accent |
| 9.4 | Cookie-banner | `cookie-banner.tsx` | Byt #1a1aff + gula gradienter → navy/orange |
| 9.5 | Beta-banner | `beta-banner.tsx` | Byt gradient → navy+orange |
| 9.6 | E-post | `src/lib/.../send.ts` | Byt #2563eb → brand-orange |
| 9.7 | Wizard-defaults | `color-palette-picker.tsx`, `prompt-wizard-modal-v2.tsx`, `mini-wizard.tsx` | Byt blå hex-presets → navy/orange-paletten |

**Resultat:** 100% konsekvent färgpalett utan undantag.

---

## SAMMANFATTNING

| Fas | Filer att ändra | Nya filer | Uppskattad komplexitet |
|-----|-----------------|-----------|----------------------|
| 1. Designfundament | 5 | 0 | Medel |
| 2. Navigation | 6 | 3 (SiteNavMenu, HeaderActions, MinimalFooter) | Hög |
| 3. Hero & Landing | 10 | 0 | Hög |
| 4. Builder/Chat UI | 9 | 0 | Hög |
| 5. Preview & Templates | 8 | 0 | Medel |
| 6. Auth | 4 | 0 | Låg |
| 7. Marketing-sidor | 9 | 1 (/priser redirect) | Medel |
| 8. OpenClaw chattbubbla | 3 | 1 (OpenClawHelpSuggestions) | Medel |
| 9. Hardkodade färger | 10+ | 0 | Medel |
| **TOTALT** | **~58 filer** | **5 nya** | — |

---

## ANALYSUNDERLAG

Detaljerade analyser per område finns i:

| Fil | Område |
|-----|--------|
| `.cursor/rules/4729.txt` | Layout, Navigation, Header, Footer |
| `.cursor/rules/8351.txt` | Hero & Landing Page |
| `.cursor/rules/2067.txt` | Builder/Chat UI |
| `.cursor/rules/5943.txt` | Styling, Colors, Design System |
| `.cursor/rules/1284.txt` | Authentication & User Pages |
| `.cursor/rules/7612.txt` | Marketing & Content Pages |
| `.cursor/rules/3596.txt` | UI Component Library |
| `.cursor/rules/9158.txt` | Preview, Templates, Publish |
