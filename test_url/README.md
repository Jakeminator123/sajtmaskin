# test_url — isolated iframe inspector lab

**Completely isolated from app logic. No imports from `src/`. Delete this folder when done.**

## Run

```bash
cd test_url
npm run dev
```

Or from project root:

```bash
node test_url/run.js
```

Flags: `--port 4173`, `--url https://...`, `--app http://localhost:3000`, `--no-open`

## Requirements

- Main app (`npm run dev` in project root) must be running on port 3000 for login/projects to work
- Node.js (no extra npm install needed)

## Features

1. **Manual URL input** — paste any demo URL directly
2. **Login + project picker** — login via main app API, then pick a project's demo_url
3. **Iframe preview** — load, force reload, clear
4. **Inspection toggle** — same-origin: full DOM highlight + CSS path. Cross-origin: coordinate fallback
5. **Open live URL** — opens the URL in a new tab (for DevTools inspection)
6. **Live monitor** — periodic probe of URL status + latency
7. **File logging** — all events logged to `test_url/logs/YYYY-MM-DD.log`
8. **UI log panel** — real-time log in sidebar

## Logging

Logs are written to `test_url/logs/`. Each day gets its own file. Events logged:

- `LOAD`, `IFRAME_LOAD`, `SLOW_WARN`
- `INSPECT_MODE`, `INSPECT_CLICK`
- `PROBE`, `MONITOR`
- `LOGIN`, `PROJECTS`, `PROJECT_PICK`

Read today's log:

```bash
type test_url\logs\2026-03-01.log      # Windows
cat  test_url/logs/2026-03-01.log      # Unix
```

Or via API: `GET http://127.0.0.1:4173/logs?tail=50`

## Cleanup

```powershell
Remove-Item -Recurse -Force test_url    # Windows
rm -rf test_url                          # Unix
```
