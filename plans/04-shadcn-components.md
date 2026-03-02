# Plan 04 – shadcn-komponenter som saknas

Prioritet: **Medium**
Uppskattad insats: ~2–3 timmar (installation) + refaktor efter behov

---

## Nuläge (uppdaterat 2026-03-02)

**Installerade (29 st):** alert, alert-dialog, avatar, badge, button, card, carousel,
checkbox, collapsible, command, confirm-dialog (custom/deprecated), dialog,
dropdown-menu, hover-card, input, label, popover, progress, scroll-area, select,
separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip

**Konfiguration:** `new-york-v4` style, `components.json` korrekt, `cn()` fungerar.

---

## Prioritet 1 – Bör läggas till snarast

### Tabs

- [x] `npx shadcn@latest add tabs`
- [x] Identifiera manuella tab-implementationer i builder och ersätt
- [x] Konverterat: `UnifiedElementPicker.tsx`, `audit-modal.tsx`, `admin/page.tsx`, `buy-credits/page.tsx`, `UiElementPicker.tsx`, `ProjectEnvVarsPanel.tsx`

### Skeleton

- [x] `npx shadcn@latest add skeleton`
- [x] Använd i `VersionHistory.tsx` (skeleton version-cards)
- [x] Använd i `projects/page.tsx` (skeleton project-cards)
- [x] Använd i `FileExplorer.tsx` (skeleton file tree)
- [x] Använd i `ElementRegistry.tsx` (skeleton element list)

### Sheet

- [x] `npx shadcn@latest add sheet`
- [ ] Kandidat: mobilvy av ChatInterface (slide-in istället för toggle)
- [ ] Kandidat: settings/env-vars panel

### Switch

- [x] `npx shadcn@latest add switch`
- [x] Ersätt raw checkbox i `BuilderHeader.tsx` ("Gäller endast nästa generation")
- [x] Ersätt raw checkbox i `ProjectEnvVarsPanel.tsx` ("Markera som känslig")
- [x] Ersätt raw checkbox i `onboarding-modal.tsx` ("Analysera mitt företag")

### Table

- [x] `npx shadcn@latest add table`
- [ ] Kandidat: `VersionHistory.tsx` – strukturera version-data
- [ ] Kandidat: admin database-vy

---

## Prioritet 2 – Bra att ha

### Avatar

- [x] `npx shadcn@latest add avatar`
- [ ] Byt ut custom avatar i `message.tsx` mot shadcn variant
- [ ] Använd i `BuilderHeader.tsx` för inloggad användare

### AlertDialog

- [x] `npx shadcn@latest add alert-dialog`
- [x] Migrera `confirm-dialog.tsx` → shadcn AlertDialog i `projects/page.tsx`
- [x] Uppdatera alla importer

### Label

- [x] `npx shadcn@latest add label`
- [x] Använd med Switch-komponenter (BuilderHeader, ProjectEnvVarsPanel)

### Checkbox

- [x] `npx shadcn@latest add checkbox`
- [ ] Kandidat: wizard steg-val (purposes, inspiration)

### Popover

- [x] `npx shadcn@latest add popover`
- [ ] Kandidat: färgväljare i ThemePicker, kompakt element-picker

---

## Prioritet 3 – Framtida

### ResizablePanel

- [ ] `npx shadcn@latest add resizable`
- [ ] Implementera i `BuilderShellContent.tsx` (ersätt fast grid)

### Breadcrumb

- [ ] `npx shadcn@latest add breadcrumb`

### ToggleGroup

- [ ] `npx shadcn@latest add toggle-group`

### Accordion

- [ ] `npx shadcn@latest add accordion`

### Form (react-hook-form integration)

- [ ] `npm install react-hook-form @hookform/resolvers`
- [ ] `npx shadcn@latest add form`
- [ ] Kandidat: wizard-formulär, buy-credits, auth-formulär

---

## Snabbinstallation (alla P1 + P2) – KLAR

```bash
npx shadcn@latest add tabs skeleton sheet switch table avatar alert-dialog label checkbox popover
```
