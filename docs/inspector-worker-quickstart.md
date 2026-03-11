# Inspector Worker Quickstart

The inspector worker is a standalone Playwright micro-service that powers the
element inspector in the builder preview. It runs on port **3310** and exposes
three endpoints:

| Endpoint        | Method | Description                                        |
| --------------- | ------ | -------------------------------------------------- |
| `/health`       | GET    | Returns `{"ok":true}` when the worker is ready     |
| `/capture`      | POST   | Screenshot + DOM element at a viewport coordinate   |
| `/element-map`  | POST   | Full element map (bounding boxes) for hover overlay |

When the worker is unreachable the app falls back to local Playwright inside
the Next.js API routes, but this is slower and heavier on the dev machine.

---

## 1) Prerequisites

Add these keys to `.env.local` (already present if you cloned the starter):

```bash
INSPECTOR_CAPTURE_WORKER_URL="http://localhost:3310"
INSPECTOR_CAPTURE_WORKER_TOKEN="change-me-inspector-token"
INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS="7000"
INSPECTOR_FORCE_WORKER_ONLY="false"
```

- `INSPECTOR_CAPTURE_WORKER_URL` enables worker forwarding.
- `INSPECTOR_CAPTURE_WORKER_TOKEN` is optional but recommended in production.
- `INSPECTOR_FORCE_WORKER_ONLY=true` disables local fallback when you want strict worker-only behavior.

## 2) First-time setup (once)

```bash
npm run inspector:install
```

This installs the worker's own `node_modules` **and** downloads the Chromium
binary that Playwright needs.

## 3) Start (automatic)

The inspector worker starts **automatically** when you run:

```bash
npm run dev      # development
npm run start    # production
```

`next-runner.mjs` detects `INSPECTOR_CAPTURE_WORKER_URL` pointing to
localhost, checks if the port is already in use, and spawns the worker as
a managed child process. When Next.js exits the worker is killed too.

Behaviour:

- **Port already in use** → skips spawning (you can still run it manually)
- **Worker crashes** → auto-restarts up to 5 times with back-off
- **`npm run build`** → worker is NOT started (not needed at build time)
- **No `INSPECTOR_CAPTURE_WORKER_URL`** → worker is not started

Worker logs appear inline in the same terminal prefixed with
`[inspector-worker]`.

### Manual start (alternative)

If you prefer running the worker in a separate terminal:

```bash
npm run inspector:start
```

Stop with **Ctrl+C** — the server shuts down gracefully.

### Docker (alternative)

```bash
npm run inspector:docker:up      # build & start
npm run inspector:docker:ps      # check status
npm run inspector:docker:logs    # stream logs
npm run inspector:docker:down    # stop
```

## 4) Verify

```bash
npm run inspector:health
# → {"ok":true,"service":"inspector-worker","playwright":true}
```

In the builder UI the **Worker** lamp next to the preview should be green.

## 5) Dev workflow

Just one terminal:

```bash
npm run dev
```

Open `http://localhost:3000/builder?project=...&chatId=...`, activate
**Inspektera preview**, and hover/click in the preview.

## 6) Fallback test (no worker)

1. Stop the worker (Ctrl+C or `npm run inspector:docker:down`).
2. Keep `INSPECTOR_CAPTURE_WORKER_URL` set in `.env.local`.
3. Click in the preview — capture still works via the local API fallback.
4. The Worker lamp turns red but functionality is preserved.

## 7) npm scripts reference

| Script                    | Description                              |
| ------------------------- | ---------------------------------------- |
| `inspector:start`         | Run worker locally with Node.js          |
| `inspector:install`       | Install deps + Chromium (first-time)     |
| `inspector:health`        | Quick health check via curl              |
| `inspector:docker:up`     | Build & start via Docker Compose         |
| `inspector:docker:down`   | Stop Docker container                    |
| `inspector:docker:logs`   | Stream Docker logs                       |
| `inspector:docker:ps`     | Show Docker container status             |

## Security defaults

The capture API and worker block internal/private hosts by default (localhost,
loopback, and private IP ranges). Keep this behaviour enabled for production.
