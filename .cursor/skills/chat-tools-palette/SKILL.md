# Chat Tools Palette (Verktyg-knappen)

Beskriver **en enda** synlig knapp i buildern — **"Verktyg"** — placerad **direkt ovanför chat-input**. Klick öppnar en **skrollbar lista in-chat** med små ikoner och korta svenska begrepp som exponerar **alla** användbara backend-funktioner. Allt annat chrome förblir minimalistiskt (Apple-yta). Inga sidomenyer, inga dropdowns i headern, inga ··· spridda i preview.

**Trigger:** Användaren säger "verktygsknappen", "chat tools palette", "skill verktyg", eller liknande.

## Vision

- Default builder = **lugn, nästan tom**: header med logga + Publicera, preview i mitten, chat-rail till höger (eller drawer i minimal). Inga fler ytor.
- **Verktyg** är enda upptäckbara power-yta i chatten. En pill på ~28 px höjd, text `Verktyg`, chevron till höger, diskret hover.
- Klick **öppnar listan inne i chatten** (som en sheet/popover förankrad ovan inputfältet), **inte** en modal, inte en drawer. Stänger vid Escape, klick utanför, eller när en åtgärd valts.
- Listan är **skrollbar**, grupperad, varje rad = liten ikon + 1–3 ords svensk etikett + valfri nyckelgenväg.
- Sökfält överst (`⌘K` även här för att öppna direkt från palett till vald åtgärd).

## Layout (ASCII)

```
+--------------------------------------------------+
|  Preview                                         |
|                                                  |
|                                   +------------+ |
|                                   | Chattråd   | |
|                                   |            | |
|                                   | [Verktyg ▾]|  ← enda knappen
|                                   | [ textbox ]| |
|                                   +------------+ |
+--------------------------------------------------+
```

Vid klick:

```
+------------+
| Chattråd   |
|            |
| ┌────────┐ |
| │ Sök…   │ |  ← 32 px input
| │ Gen.   │ |  ← gruppheader (caps, muted, 11 px)
| │ ○ Ny … │ |  ← rad (ikon 14 + etikett + genväg)
| │ ○ Regen│ |
| │ Preview│ |
| │ ○ Uppd.│ |
| │ …      │ |
| └────────┘ |
| [Verktyg ▾]|
| [ textbox ]|
+------------+
```

## Interaktion (kanon)

- Klick på `Verktyg` → listan fader in på 150 ms (ease-out), max höjd `min(60vh, chat-rail-höjd - input)`, scroll i listan.
- Enter i sökfält → kör första träffen. `↑/↓` navigerar, `Enter` väljer, `Esc` stänger.
- Global genväg `⌘K` (alltid aktiv) → öppnar samma palett, fokus i sök.
- Varje rad = **en** handling. Inga undermenyer; om input krävs → ett lätt sheet i samma kolumn (t.ex. “Publicera” öppnar sheet enligt `surface-07-publish.txt`).
- Alla åtgärder använder befintliga hooks/API:er. Paletten äger **ingen** affärslogik, bara routing.

## Funktionslista (koppling mot backend)

Källa: `reviews/capability-*.txt` (backend-capability-audit). Ikoner från lucide-react (enkla, monokroma). Etikett ≤3 ord. Genväg valfri.

### 1. Generera

| Etikett | Ikon | Koppling (fil:rad eller hook) |
|----|----|----|
| Ny generation | `Plus` | `handleCreateChatStreamPost` (create-chat-stream-post.ts:171) |
| Generera om | `RotateCcw` | useSendMessage + stream …/stream |
| Stoppa generering | `Square` | `cancelActiveGeneration` (useChatMessaging.ts:102) |
| Byt mall | `LayoutGrid` | scaffold dropdown → palett (matcher.ts:1004) |
| Byt modell | `Sparkles` | header modell → palett |
| Djup brief | `FileText` | POST /api/ai/brief (ai/brief/route.ts:16) |
| Polera prompt | `Wand2` | usePromptRewrite shallow (usePromptRewrite.ts:138) |

### 2. Preview & VM

| Etikett | Ikon | Koppling |
|----|----|----|
| Uppdatera preview | `RefreshCw` | iframe reload (PreviewPanel.tsx:635) |
| Starta om VM | `Power` | POST preview-session forceRestart (:27) |
| Stäng VM | `PowerOff` | POST preview-destroy (:21) |
| Viloläge VM | `Moon` | POST preview-hibernate (api.ts:59) |
| Förhandsstatus | `Activity` | GET preview-status (:25) |
| Byt enhet | `Monitor` | setPreviewDevice (PreviewPanelChrome.tsx:217) |
| Inspektera | `MousePointer` | POST inspector-ai-match (:175) |
| Öppna i ny flik | `ExternalLink` | window.open previewUrl (PreviewPanel.tsx:648) |
| Kodvy | `Code2` | setViewMode kod |
| Register | `FolderTree` | setViewMode register |

### 3. Innehåll

| Etikett | Ikon | Koppling |
|----|----|----|
| Ladda upp media | `Upload` | POST /api/media/upload (:86) |
| Stock-bilder | `Image` | fetchStockImages (stock-providers.ts:62) |
| Hämta om sajt | `Globe` | POST /api/wizard/quick-scrape (:22) |
| Företagsintel | `Building2` | POST /api/builder/company-intel (:39) |
| Normalisera text | `Type` | POST normalize-text (:16) |
| Validera bilder | `ImageCheck` | POST validate-images (:17) |
| Validera CSS | `Braces` | POST validate-css (:16) |

### 4. Versioner

| Etikett | Ikon | Koppling |
|----|----|----|
| Historik | `History` | GET versions (versions/route.ts:20) |
| Förgrena version | `GitBranch` | POST versions fork (:190) |
| Godkänn plan | `CheckCircle2` | POST approval (:27) |
| Kommentarer | `MessageSquare` | GET/POST comments (:7) |
| Jämför versioner | `GitCompare` | VersionCompareDialog |
| Exportera ZIP | `Archive` | POST export (:20) |
| Ladda ner | `Download` | GET download (:6) |

### 5. Publicera

| Etikett | Ikon | Koppling |
|----|----|----|
| Publicera | `Rocket` | POST v0/deployments (:364) |
| Tidigare builds | `ListOrdered` | GET v0/deployments (:636) |
| Byggstatus | `Gauge` | SSE events (useDeploymentStatus.ts:31) |
| Öppna bygge | `ExternalLink` | inspectorUrl via SSE |
| Domän | `Link2` | POST /api/domains/check |
| Miljövariabler | `KeyRound` | ProjectEnvVarsPanel / env-vars API |
| GitHub export | `Github` | POST /api/github/export |

### 6. Kvalitet

| Etikett | Ikon | Koppling |
|----|----|----|
| Kör autofix | `Wrench` | dispatchAutoFixEvent (auto-fix-events.ts:5) |
| LLM-reparation | `Stethoscope` | POST repair (:103) |
| Godkänn fix | `CheckCheck` | POST accept-repair (:15) |
| Kvalitetsgate | `ShieldCheck` | POST quality-gate (:108) |
| Rapportera fel | `Bug` | POST error-log (:19) |

### 7. Spår & Data

| Etikett | Ikon | Koppling |
|----|----|----|
| Modellspår | `Activity` | ModelTraceOverlay (Alt+Shift+M idag) |
| Spara projekt | `Save` | useBuilderDeployActions save |
| Hämta historik | `Inbox` | GET engine/chats/[id] (:15) |
| Saldo & credits | `Coins` | GET credits/check (:45) |
| Lanseringsstatus | `CircleCheck` | GET readiness (:316) |
| Feedback version | `ThumbsUp` | POST feedback (:14) |

### 8. Hjälp & Avancerat

| Etikett | Ikon | Koppling |
|----|----|----|
| Fråga OpenClaw | `HelpCircle` | POST /api/openclaw/chat (:73) |
| Daglig tips | `Lightbulb` | POST /api/openclaw/tips (:180) |
| Kortkommandon | `Command` | lokal modal (?-genväg) |
| Avancerat | `SlidersHorizontal` | sheet: FEATURES toggles (config.ts:341+) |

## Regler

- **Inga** knappar/menyer får läggas till i headern eller preview-chrome för funktioner som redan finns i paletten. Paletten är **ett** hem; `Publicera` får spegla som pill i header (enda undantaget).
- Etiketter på svenska, **max 3 ord**, inga emojis.
- Ikoner 14 px, `stroke-width: 1.5`, ingen färg (accent endast på aktiv rad via `bg-muted/40`).
- Sök filtrerar **både** etikett och gruppnamn; ingen fuzzy-exotik (prefix/innehåller räcker).
- Tangentbord alltid tillgängligt; varje rad fokuserbar med `focus-visible:ring-2 ring-ring/40`.
- Stäng paletten när en åtgärd valts; resultat syns på primär yta (chat, preview, sheet), inte i paletten.
- Motion: 150 ms ease-out öppna/stäng. Ingen bounce, ingen spring.
- Respektera `prefers-reduced-motion`: hoppa fade, visa direkt.

## Implementationsguide

1. **Komponent:** `src/components/builder/ChatToolsPalette.tsx` — en shadcn `Command`-lista (`src/components/ui/command.tsx`) renderad som popover/inline sheet ovanför `ChatInterface`s textarea.
2. **Datakälla:** en ren data-modul `src/lib/builder/chat-tools.ts` som exporterar `ToolAction[]` med `{ id, group, label, icon, shortcut?, run(ctx) }`. Grupperingen följer ovan.
3. **Aktivering:**
   - Knapp `Verktyg ▾` i `ChatInterface` precis ovanför `PromptInput` (liten border-top-kant, 28 px höjd, ghost-look).
   - Global `⌘K` byter från BuilderDisclosurePill till paletten (se `interaction-01-shortcuts-global.txt`). Drawer flyttas till annan chord om den behålls.
4. **Routing:** `run(ctx)` anropar befintliga hooks/fetchs. Inga nya backend-endpoints.
5. **Cleanup enligt `cleanup-and-scope.mdc`:** ta bort motsvarande knappar/dropdowns i `BuilderHeader` och `PreviewPanelChrome` i samma leverans (spara bara `Publicera`-pill i header). Uppdatera `reviews/surface-*.txt` som pekade på äldre ytor.
6. **Tester:** snapshot på `ChatToolsPalette` renderingen, enhetstester på `chat-tools.ts`-filterlogik, manuell QA av tangentbordsnavigation.

## Acceptance

- Buildern utan öppen palett visar: logga, `Publicera`, preview, chat-rail, `Verktyg`-knapp, input, inget annat.
- `Verktyg` öppnar en lista som täcker **alla** funktioner i sektionerna 1–8 ovan.
- Varje rad är kopplad till backend via befintlig kod (referens i tabellerna).
- Ingen funktion blir förlorad jämfört med nuvarande UI; alla gamla knappar som flyttas in i paletten tas bort samma leverans.
- Palett, sök och navigation fungerar med enbart tangentbord.
