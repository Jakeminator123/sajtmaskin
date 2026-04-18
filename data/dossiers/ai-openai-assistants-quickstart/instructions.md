# When to use

Use this dossier when the site needs a custom chat or agent UI backed by the OpenAI Assistants API and you want the server to manage assistants, threads, and files.

Typical fits:
- internal tools or dashboards with AI assistants
- SaaS apps that need retrieval over uploaded files
- apps that want code interpreter or assistant-managed tools

Do **not** use this dossier for a purely client-side chatbot or for simple single-turn text generation. In those cases, use a Responses/Chat Completions style integration instead.

# How to integrate

## 1) Install dependencies

```bash
npm install openai react-markdown
```

`react-markdown` is optional unless your UI renders markdown assistant responses.

## 2) Add environment variables

```env
OPENAI_API_KEY=sk-...
OPENAI_ASSISTANT_ID=asst_...
```

Notes:
- `OPENAI_API_KEY` is required.
- `OPENAI_ASSISTANT_ID` is required if you are using the file routes in this dossier as written.
- The referenced assistant should have the tools you need enabled, especially `file_search` and/or `code_interpreter`.

## 3) Add a shared OpenAI server client

Create `app/openai.ts`:

```ts
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

Create `app/assistant-config.ts`:

```ts
export const assistantId = process.env.OPENAI_ASSISTANT_ID || "";
```

Keep these server-only. Do not expose the API key to the client.

## 4) Add the API routes

### Create an assistant

Use this only if your app should create assistants dynamically. Many apps should create the assistant once in OpenAI and store its id in `OPENAI_ASSISTANT_ID`.

```ts
import { openai } from "@/app/openai";

export const runtime = "nodejs";

export async function POST() {
  const assistant = await openai.beta.assistants.create({
    instructions: "You are a helpful assistant.",
    name: "App Assistant",
    model: "gpt-4o",
    tools: [
      { type: "code_interpreter" },
      { type: "file_search" },
    ],
  });

  return Response.json({ assistantId: assistant.id });
}
```

### Create a thread

```ts
import { openai } from "@/app/openai";

export const runtime = "nodejs";

export async function POST() {
  const thread = await openai.beta.threads.create();
  return Response.json({ threadId: thread.id });
}
```

### Upload/list/delete files attached to the assistant vector store

```ts
import { assistantId } from "@/app/assistant-config";
import { openai } from "@/app/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const vectorStoreId = await getOrCreateVectorStore();

  const openaiFile = await openai.files.create({
    file,
    purpose: "assistants",
  });

  await openai.beta.vectorStores.files.create(vectorStoreId, {
    file_id: openaiFile.id,
  });

  return Response.json({ fileId: openaiFile.id });
}

export async function GET() {
  const vectorStoreId = await getOrCreateVectorStore();
  const fileList = await openai.beta.vectorStores.files.list(vectorStoreId);

  const files = await Promise.all(
    fileList.data.map(async (file) => {
      const fileDetails = await openai.files.retrieve(file.id);
      const vectorFileDetails = await openai.beta.vectorStores.files.retrieve(
        vectorStoreId,
        file.id
      );

      return {
        file_id: file.id,
        filename: fileDetails.filename,
        status: vectorFileDetails.status,
      };
    })
  );

  return Response.json(files);
}

export async function DELETE(request: Request) {
  const { fileId } = await request.json();

  if (!fileId) {
    return Response.json({ error: "Missing fileId" }, { status: 400 });
  }

  const vectorStoreId = await getOrCreateVectorStore();
  await openai.beta.vectorStores.files.del(vectorStoreId, fileId);

  return new Response(null, { status: 204 });
}

async function getOrCreateVectorStore() {
  if (!assistantId) {
    throw new Error("OPENAI_ASSISTANT_ID is required for file search");
  }

  const assistant = await openai.beta.assistants.retrieve(assistantId);
  const existing = assistant.tool_resources?.file_search?.vector_store_ids?.[0];

  if (existing) return existing;

  const vectorStore = await openai.beta.vectorStores.create({
    name: "assistant-vector-store",
  });

  await openai.beta.assistants.update(assistantId, {
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  });

  return vectorStore.id;
}
```

### Download a file by id

```ts
import { openai } from "@/app/openai";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { fileId: string } }
) {
  const fileId = params.fileId;

  const [file, fileContent] = await Promise.all([
    openai.files.retrieve(fileId),
    openai.files.content(fileId),
  ]);

  return new Response(fileContent.body, {
    headers: {
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
```

## 5) Connect your UI to these routes

Typical client flow:

1. `POST /api/assistants/threads` to get a `threadId`
2. optionally `POST /api/assistants/files` with `FormData` to upload files
3. use the `threadId` and your `assistantId` in your own message/run route or server action
4. poll or stream responses in your chat UI
5. render markdown if assistant responses include markdown

Example file upload from the client:

```ts
const formData = new FormData();
formData.append("file", selectedFile);

await fetch("/api/assistants/files", {
  method: "POST",
  body: formData,
});
```

Example thread creation:

```ts
const res = await fetch("/api/assistants/threads", { method: "POST" });
const { threadId } = await res.json();
```

## 6) Add your own message/run execution route

This dossier does **not** include a complete message submission + run polling/streaming route. In most apps, you should add one server route that:
- appends a user message to a thread
- creates a run for the configured assistant
- handles tool calls if you use custom functions
- returns streamed text/events or a finalized assistant response

Keep that logic server-side.

# UX rules

- Treat file indexing as asynchronous. Uploaded files may not be searchable immediately; show statuses like `in_progress`, `completed`, or `failed`.
- Make thread creation invisible to the user. Create a thread on first interaction and persist its id in client state or your database.
- Show upload progress and uploaded file names if file search is part of the workflow.
- If assistant responses contain markdown, render it safely and keep code blocks readable.
- Use clear empty states: no thread yet, no files uploaded, indexing in progress, assistant unavailable.
- Provide retry UI for transient OpenAI failures and timeouts.

# Avoid

- Do not put `OPENAI_API_KEY` in client components, browser env vars, or public runtime config.
- Do not keep the template layout, OpenAI logo, warning components, or branded metadata unless the user explicitly wants them.
- Do not assume assistant creation should happen on every deploy or request. In production, prefer a stable pre-created assistant id.
- Do not use the file endpoints unless the assistant has `file_search` enabled.
- Do not assume uploaded files are immediately retrievable by the assistant; vector store processing can lag.
- Do not expose arbitrary file downloads without checking user authorization in multi-user apps.
- Do not rely on demo function tools like `get_weather` unless you also implement run tool-call handling.

# Verification

Check these before shipping:

1. Environment
   - `OPENAI_API_KEY` is set
   - `OPENAI_ASSISTANT_ID` is set if using file routes

2. Route checks
   - `POST /api/assistants/threads` returns `{ "threadId": "..." }`
   - `POST /api/assistants` returns `{ "assistantId": "..." }` if you kept dynamic assistant creation
   - `POST /api/assistants/files` accepts multipart form data
   - `GET /api/assistants/files` returns file records with `status`
   - `GET /api/files/[fileId]` downloads a real file

3. OpenAI configuration
   - assistant exists
   - required tools are enabled on that assistant
   - if using retrieval, the assistant has an attached vector store after first upload

4. Production concerns
   - routes run in Node.js runtime
   - authorization is added around thread/file access for multi-user apps
   - UI handles indexing delay and API failures gracefully
