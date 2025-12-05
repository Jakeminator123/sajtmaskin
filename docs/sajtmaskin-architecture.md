# Sajtmaskin - Arkitektur & Funktioner

Detta dokument beskriver hur Sajtmaskin fungerar. Kan användas för att träna AI-assistenten.

---

## 🎯 Vad är Sajtmaskin?

Sajtmaskin är en AI-driven webbplatsbyggare på svenska som låter användare:

1. Generera webbsidor med AI (via v0 API)
2. Förfina designs med chat
3. Ta över projekt för avancerad AI-redigering
4. Analysera befintliga webbplatser (audit)
5. Ladda ner eller publicera färdiga sajter

---

## 🏗️ Tech Stack

| Lager         | Teknologi                                   |
| ------------- | ------------------------------------------- |
| Frontend      | Next.js 15 (App Router), React, TypeScript  |
| Styling       | Tailwind CSS, shadcn/ui komponenter         |
| 3D Avatar     | Three.js, React Three Fiber                 |
| Backend       | Next.js API Routes                          |
| Databas       | SQLite (better-sqlite3)                     |
| Cache         | Redis Cloud                                 |
| AI            | OpenAI (GPT-5.1 Codex, GPT-4o, gpt-image-1) |
| Kodgenerering | Vercel v0 API                               |
| Hosting       | Render                                      |

---

## 📁 Mappstruktur

```
app/src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Startsida (/)
│   ├── builder/           # Bygg-verktyget (/builder)
│   ├── projects/          # Mina projekt (/projects)
│   ├── project/[repoId]/  # AI Studio för övertagna projekt
│   ├── buy-credits/       # Köp diamanter
│   ├── admin/             # Admin-panel
│   └── api/               # API-endpoints
│       ├── generate/      # Generera sajt med v0
│       ├── refine/        # Förfina sajt med v0
│       ├── agent/edit/    # AI-redigering med GPT-5.1 Codex
│       ├── projects/      # CRUD för projekt
│       ├── auth/          # Autentisering (Google, GitHub)
│       └── avatar-guide/  # Avatar AI-svar
├── components/            # React-komponenter
│   ├── avatar/            # 3D Avatar
│   ├── ui/                # shadcn/ui komponenter
│   └── ...
├── lib/                   # Utility-funktioner
│   ├── database.ts        # SQLite-operationer
│   ├── redis.ts           # Redis cache & projektlagring
│   ├── openai-agent.ts    # GPT-5.1 Codex agent
│   ├── v0-generator.ts    # v0 API integration
│   └── auth.ts            # Autentisering
└── contexts/              # React Context
```

---

## 🔄 Användarflöden

### 1. Skapa ny sajt

```
Användare skriver prompt
      ↓
/api/generate → v0 API
      ↓
Får tillbaka: demoUrl + kod + filer
      ↓
Sparas i SQLite (projects + project_data)
      ↓
Visas i Builder med iframe preview
```

### 2. Förfina sajt

```
Användare skriver ändring i chatten
      ↓
/api/refine → v0 API (med chatId)
      ↓
Uppdaterad demoUrl + kod
      ↓
Preview uppdateras
```

### 3. Ta över projekt (Takeover)

```
Klicka "Ta över" på projekt
      ↓
Välj läge: Redis (snabbt) eller GitHub (full ägandeskap)
      ↓
/api/projects/[id]/takeover
      ↓
Redis: Filer sparas i Redis (365 dagars TTL)
GitHub: Repo skapas, filer pushas
      ↓
Kan nu redigera med AI Studio
```

### 4. AI Studio (efter takeover)

```
Användare skriver instruktion
      ↓
/api/agent/edit
      ↓
OpenAI GPT-5.1 Codex
      ↓
Tools: read_file, update_file, list_files
      ↓
Filer uppdateras i Redis/GitHub
```

---

## 💎 Kreditsystem (Diamanter)

| Handling                 | Kostnad             |
| ------------------------ | ------------------- |
| Ny användare             | +5 diamanter gratis |
| Generera sajt            | -1 diamant          |
| Förfina sajt             | -1 diamant          |
| AI Studio: code_edit     | -1 diamant          |
| AI Studio: copy          | -1 diamant          |
| AI Studio: web_search    | -2 diamanter        |
| AI Studio: image         | -3 diamanter        |
| AI Studio: code_refactor | -5 diamanter        |

Diamanter köps via Stripe. 1 diamant ≈ 10 kr.

---

## 🤖 AI-modeller

### Kodgenerering (v0)

- Vercel v0 API för initial generering och förfining
- Returnerar hostade demos + källkod

### AI Studio (efter takeover)

- `gpt-5.1-codex-mini`: Snabb kodredigering
- `gpt-5.1-codex`: Komplex refaktorering
- `gpt-5-mini`: Copywriting, text
- `gpt-5`: Bildgenerering med tools
- `gpt-image-1`: Bildgenerering

### Avatar Guide

- `gpt-4o-mini`: Snabba, billiga svar
- Kontextmedveten (vet vilken sida användaren är på)

---

## 🎭 3D Avatar

Avataren är en GLB-modell som renderas med Three.js:

- **Animationer**: IDLE, TALK_PASSION, TALK_HANDS, CONFIDENT, etc.
- **Tooltip**: Visar meddelanden bredvid avataren
- **Chat Modal**: Användaren kan ställa frågor
- **Proaktiva tips**: Visas om användaren verkar fast

### Avatar API

`POST /api/avatar-guide`

```json
{
  "message": "Hur skapar jag en landing page?",
  "currentSection": "home",
  "lastAction": "viewed_templates",
  "conversationHistory": []
}
```

Svar:

```json
{
  "message": "Kolla mallarna! Börja med 'Landing Page' kategorin.",
  "animation": "TALK_PASSION"
}
```

---

## 🗄️ Datalagring

### SQLite (Persistent)

- `users`: Användare, diamanter, GitHub-koppling
- `projects`: Projektmetadata
- `project_data`: v0 chatId, demoUrl, filer
- `transactions`: Betalningshistorik

### Redis (Cache + Takeover)

- `user:session:*`: Användarssessioner (7 dagar TTL)
- `project:files:*`: Övertagna projektfiler (365 dagar TTL)
- `project:meta:*`: Projektmetadata
- Rate limiting

---

## 🔐 Autentisering

- **Google OAuth**: Primär inloggning
- **Email/Password**: Alternativ
- **GitHub OAuth**: För projekt-takeover till GitHub

JWT-tokens lagras i cookies (`session_token`).

---

## 📡 API-endpoints (viktiga)

| Endpoint                      | Metod          | Beskrivning            |
| ----------------------------- | -------------- | ---------------------- |
| `/api/generate`               | POST           | Generera ny sajt       |
| `/api/refine`                 | POST           | Förfina befintlig sajt |
| `/api/projects`               | GET/POST       | Lista/skapa projekt    |
| `/api/projects/[id]`          | GET/PUT/DELETE | Hantera projekt        |
| `/api/projects/[id]/takeover` | POST           | Ta över projekt        |
| `/api/projects/[id]/download` | GET            | Ladda ner ZIP          |
| `/api/agent/edit`             | POST           | AI-redigering          |
| `/api/avatar-guide`           | POST           | Avatar AI-svar         |
| `/api/auth/me`                | GET            | Nuvarande användare    |
| `/api/credits`                | GET            | Kolla diamanter        |

---

## 🎨 UI-sektioner

### Startsida (/)

- Prompt-input för att beskriva sajt
- Mallgalleri (kategorier: landing, dashboard, webapp, etc.)
- 3D Avatar i hörnet

### Builder (/builder)

- Split view: Chat + Preview (iframe)
- Skicka ändringar i chat → uppdaterad preview
- Ladda ner / Ta över knappar

### Mina Projekt (/projects)

- Grid med alla projekt
- AI Studio-projekt (övertagna) visas separat
- Klicka för att öppna i Builder eller AI Studio

### AI Studio (/project/[id])

- Avancerad redigering med GPT-5.1 Codex
- Lägen: Kod, Copy, Media, Sök, Avancerat
- Preview-panel
- ZIP-download för Redis-projekt

---

## 💡 Tips för Avatar

När användaren frågar om Sajtmaskin:

1. **"Hur skapar jag en sajt?"**
   → Skriv vad du vill ha i prompten, eller välj en mall!

2. **"Vad kostar det?"**
   → 5 gratis diamanter, sedan 1 per generation. Köp fler i shoppen.

3. **"Hur tar jag över mitt projekt?"**
   → I Builder, klicka "Ta över" → välj Redis (snabbt) eller GitHub.

4. **"Kan jag ladda ner koden?"**
   → Ja! I Builder eller AI Studio finns nedladdningsknapp.

5. **"Vad är AI Studio?"**
   → Avancerad redigerare för övertagna projekt. Använder GPT-5.1 Codex.
