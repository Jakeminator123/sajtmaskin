# When to use

Use this dossier when the app needs **live microphone transcription in the browser** using **Deepgram realtime speech-to-text**.

Typical fits:
- meeting or call transcription
- voice notes with live captions
- accessibility captions for spoken input
- AI agents or voice UIs that need streaming transcripts

This dossier is specifically for:
- **Next.js App Router** projects
- a **server-issued auth endpoint** at `/api/authenticate`
- a **browser client** that opens a Deepgram realtime websocket after fetching a temporary token

# How to integrate

## 1) Install dependency

```bash
npm install @deepgram/sdk
```

Remove template-only dependencies if they were copied from the source template:
- `classnames`
- `react-device-detect`
- `react-github-btn`
- `react-syntax-highlighter`

## 2) Add environment variables

Required:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key
```

Optional, but used by the provided files:

```env
DEEPGRAM_ENV=production
ALLOWED_ORIGIN=http://localhost:3000
ALLOWED_METHODS=GET,OPTIONS
ALLOWED_HEADERS=Content-Type,Authorization
EXPOSED_HEADERS=
PREFLIGHT_MAX_AGE=86400
CREDENTIALS=false
```

Notes:
- `DEEPGRAM_ENV=development` makes the route return the raw API key directly. This is convenient for local development but should not be used in production.
- For production, prefer temporary token issuance via `deepgram.auth.grantToken()`.

## 3) Add the server auth route

Create `app/api/authenticate/route.ts`:

```ts
import { DeepgramError, createClient } from "@deepgram/sdk";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY" },
      { status: 500 }
    );
  }

  if (process.env.DEEPGRAM_ENV === "development") {
    return NextResponse.json({ key: apiKey });
  }

  const deepgram = createClient(apiKey);
  const { result, error } = await deepgram.auth.grantToken();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to generate temporary token" },
      { status: 500 }
    );
  }

  if (!result) {
    return NextResponse.json(
      {
        error: new DeepgramError(
          "Failed to generate temporary token. Make sure the API key has Member scope or higher."
        ).message,
      },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ...result, requestUrl: request.url });
  response.headers.set("Surrogate-Control", "no-store");
  response.headers.set(
    "Cache-Control",
    "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Expires", "0");

  return response;
}
```

Why this matters:
- browser clients should not embed a long-lived Deepgram server key in production
- the route disables caching so each request gets fresh auth material

## 4) Add CORS middleware only if needed

If the frontend and Next.js API run on different origins, add `middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

const allowedMethods = (process.env.ALLOWED_METHODS || "GET,OPTIONS").split(",");
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "").split(",").filter(Boolean);
const allowedHeaders = (process.env.ALLOWED_HEADERS || "Content-Type,Authorization").split(",");
const exposedHeaders = (process.env.EXPOSED_HEADERS || "").split(",").filter(Boolean);
const maxAge = process.env.PREFLIGHT_MAX_AGE
  ? Number.parseInt(process.env.PREFLIGHT_MAX_AGE, 10)
  : undefined;
const credentials = process.env.CREDENTIALS === "true";

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin") || "";
  const allowAnyOrigin = allowedOrigins.includes("*");
  const isAllowedOrigin = allowAnyOrigin || allowedOrigins.includes(origin);

  if (isAllowedOrigin) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      allowAnyOrigin ? "*" : origin
    );
  }

  response.headers.set("Access-Control-Allow-Credentials", String(credentials));
  response.headers.set("Access-Control-Allow-Methods", allowedMethods.join(","));
  response.headers.set("Access-Control-Allow-Headers", allowedHeaders.join(","));

  if (exposedHeaders.length > 0) {
    response.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(","));
  }

  if (typeof maxAge === "number" && !Number.isNaN(maxAge)) {
    response.headers.set("Access-Control-Max-Age", String(maxAge));
  }

  return response;
}

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return applyCors(request, new NextResponse(null, { status: 204 }));
  }

  return applyCors(request, NextResponse.next());
}

export const config = {
  matcher: "/api/authenticate",
};
```

If the transcription UI is served from the same Next.js origin, middleware is optional.

## 5) Connect from the browser

Minimal client helper:

```ts
export async function getDeepgramAccessToken() {
  const response = await fetch("/api/authenticate", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Deepgram access token");
  }

  return response.json();
}

export async function createDeepgramRealtimeConnection(options = {}) {
  const auth = await getDeepgramAccessToken();
  const token = auth.access_token || auth.token || auth.key;

  if (!token) {
    throw new Error("Deepgram auth response did not include a usable token");
  }

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    interim_results: "true",
    endpointing: "300",
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, String(value)])
    ),
  });

  return new WebSocket(
    `wss://api.deepgram.com/v1/listen?${params.toString()}`,
    ["token", token]
  );
}
```

Example React usage:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export function LiveTranscriptionDemo() {
  const [lines, setLines] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const authRes = await fetch("/api/authenticate", { cache: "no-store" });
    const auth = await authRes.json();
    const token = auth.access_token || auth.token || auth.key;

    const params = new URLSearchParams({
      model: "nova-2",
      interim_results: "true",
      smart_format: "true",
    });

    const socket = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      ["token", token]
    );

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const transcript = data?.channel?.alternatives?.[0]?.transcript;
      if (transcript) setLines((prev) => [...prev, transcript]);
    };

    socketRef.current = socket;

    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm",
    });

    recorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        const buffer = await event.data.arrayBuffer();
        socket.send(buffer);
      }
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    socketRef.current?.close();
  }

  useEffect(() => {
    return () => stop();
  }, []);

  return (
    <div>
      <button onClick={start}>Start transcription</button>
      <button onClick={stop}>Stop</button>
      <pre>{lines.join("\n")}</pre>
    </div>
  );
}
```

Runtime LLM note:
- adapt the websocket query params to the user’s language/model requirements
- handle Deepgram event shapes defensively; message payloads may include interim and final results
- do not copy the source template’s demo layout, fonts, marketing metadata, or custom context providers unless the user explicitly wants that UI architecture

# UX rules

- Ask for microphone permission only in response to a clear user action.
- Show visible recording state: idle, connecting, listening, error, stopped.
- Distinguish interim transcript text from finalized text if showing realtime updates.
- Provide a stop control that closes both the `MediaRecorder` and the websocket.
- Surface token/auth failures clearly; don’t leave the UI stuck in a loading state.
- If transcription is central to the product, include permission/error guidance for denied mic access.
- Persist or stream transcript text separately if the app needs history; the websocket session alone is not storage.

# Avoid

- Do not expose a long-lived Deepgram API key to production browsers.
- Do not keep the auth route cached; token responses should be uncached.
- Do not include the template’s branded layout, local fonts, syntax highlighter UI, or GitHub/demo widgets unless specifically requested.
- Do not assume CORS middleware is required in same-origin deployments.
- Do not send audio before the websocket is open.
- Do not forget to handle `OPTIONS` requests if the auth endpoint is called cross-origin.
- Do not rely on `DEEPGRAM_ENV=development` outside local development.

# Verification

1. Set `DEEPGRAM_API_KEY` in `.env.local`.
2. Start the Next.js app.
3. Request the auth endpoint:

```bash
curl -i http://localhost:3000/api/authenticate
```

Expected:
- HTTP 200
- JSON containing either a temporary token payload or `{ "key": "..." }` in development mode
- cache-control headers preventing caching

4. Open the app, click a button that starts mic capture, and speak.
5. Confirm:
- microphone permission prompt appears
- websocket connects successfully
- transcript text appears live
- stopping recording closes the session cleanly

For cross-origin setups, also verify preflight:

```bash
curl -i -X OPTIONS http://localhost:3000/api/authenticate \
  -H "Origin: http://localhost:4000" \
  -H "Access-Control-Request-Method: GET"
```

Expected:
- 204 or 200 response
- `Access-Control-Allow-Origin` and other configured CORS headers present
- frontend can fetch `/api/authenticate` from the allowed origin
