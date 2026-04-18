# Chat Dock Behavior Review

Granskar exakt hur chatfönstret ska uppföra sig när sajten är byggd: öppet som default, mjukt minimerbart med en `>`-knapp (pek-åt-höger för att dra ihop / åt-vänster för att expandera), ingen panel-chrome som stör, men alltid 1 klick bort.

**Trigger:** Användaren säger "chat dock", "minimera chat review", "skill chat dock" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar sin yta, läser alla relevanta filer, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 40 rader, prioriterad lista, betyg 1–5 per punkt, konkreta fil- och radreferenser där möjligt.
- Perspektiv: "Chatten är byggarens notblad — alltid där, aldrig i vägen. Apple-mässigt: rail collapse med en `>` i sidan, ingen header-kraft."
- Målmodell: efter första generation är chatten **öppen**, max ~380px, med en subtil `>`-knapp i dess vänstra kant som drar ihop den till en tunn `|` (ca 36px) med en `<`-knapp för att öppna igen. Ingen modal, ingen overlay — alltid dockad till höger (desktop) eller bottomsheet (mobil).

## Subagenter

### Agent 1 — Nuvarande chat open/close-logik
- **Fil:** `reviews/chatdock-01-current-state.txt`
- **Scope:** `src/app/builder/useBuilderState.ts`, `useBuilderPageController.ts`, `BuilderShellContent.tsx`.
- **Fokus:** Kartlägg alla states som styr chatens synlighet (`uiMode`, `detailsDrawerOpen`, `sidebarOpen` m.fl.). Lista dessa, beskriv vilka som påverkar chat-panelen, och peka på motsägelser eller överlapp. Föreslå EN kanonisk state: `chatDockCollapsed: boolean`.

### Agent 2 — Default-beteende efter generation
- **Fil:** `reviews/chatdock-02-post-generation-default.txt`
- **Scope:** `useBuilderPageController.ts`, `useBuilderPromptActions.ts`, `ChatInterface.tsx`, events runt `onGenerationComplete`.
- **Fokus:** Var triggas "sajten är byggd"? Hur ska chatten automatiskt öppnas där? Beskriv exakt insertion point, nuvarande beteende och hur det ska bli (default open med mjuk slide-in 200ms). Lista 3 alternativa trigger-punkter med för/nackdelar.

### Agent 3 — `>` / `<` minimize-knappen
- **Fil:** `reviews/chatdock-03-collapse-handle.txt`
- **Scope:** `BuilderShellContent.tsx`, `BuilderDetailsDrawer.tsx`, `ChatInterface.tsx`, preview-panelens layout.
- **Fokus:** Var ska handle-knappen sitta (rekommendation: vänstra kanten av chatrailen, 50% vertikalt, 40×40 klickyta, 1px border, text "›" eller "‹")? Specificera klickyta, hover-feedback, keyboard-shortcut (föreslå `⌘\`), aria-label, tooltip. Rita ASCII-skiss av hur det ser ut öppet vs kollapsat.

### Agent 4 — Kollapsat läge (rail)
- **Fil:** `reviews/chatdock-04-collapsed-rail.txt`
- **Scope:** Samma som Agent 3 + `PreviewPanel.tsx` (för att säkerställa full-width).
- **Fokus:** När kollapsad — ska rail visa något (antal olästa svar? en liten pulserande prick om generation pågår? "›" endast)? Förslag: 36–40px bred, endast `‹`-handle + en valfri dot som indikator. Beskriv hur preview expanderar till full bredd utan layout-shift (använd `flex-1` eller CSS grid).

### Agent 5 — Expanderat läge (dock)
- **Fil:** `reviews/chatdock-05-expanded-dock.txt`
- **Scope:** `ChatInterface.tsx`, `prompt-input/`, scroll-container.
- **Fokus:** Öppen chat — bredd (360–420px), höjd (full), interna paddings, meddelandetäthet, input-area sticky nere, scroll-pil när nytt svar kommer. Föreslå tydlig min/max bredd och om breddjustering med drag-handle bör finnas.

### Agent 6 — Mobil-beteende
- **Fil:** `reviews/chatdock-06-mobile.txt`
- **Scope:** Responsiva klasser i builder, ev. `use-media-query` hooks.
- **Fokus:** Hur ska detta kännas på mobil? Apple-likt: bottom sheet med swipe-ned för att minimera, "‹ Chat" som flytande knapp nere när stängd. Beskriv gesture-stöd, kollisioner med keyboard, safe-area-insets.

### Agent 7 — Persistens och sessionsminne
- **Fil:** `reviews/chatdock-07-persistence.txt`
- **Scope:** `useBuilderState.ts`, `localStorage`-användning, sessions-hooks.
- **Fokus:** Ska `chatDockCollapsed` spara i localStorage? Per chatId eller globalt? Vad händer när man byter projekt? Ska default alltid vara "öppen efter första generation", men respektera senaste val? Föreslå exakt nyckel och format.

### Agent 8 — Interaktion med overlays och overlayhierarki
- **Fil:** `reviews/chatdock-08-z-and-overlays.txt`
- **Scope:** `BuilderDetailsDrawer.tsx`, `NextStepPickerPopup.tsx`, `GenerationProgress.tsx`, z-index, focus-trap.
- **Fokus:** Hur ska chatten samverka med drawer, popup och generation-overlay? Får chatten ligga över eller under dessa? Vad händer med keyboard focus och ESC? Rita en z-index-karta och föreslå en enda policy (t.ex. chat=40, drawer=50, overlay=60, dialog=70).
