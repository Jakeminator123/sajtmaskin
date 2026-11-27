// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  // Execute Drizzle's actual SELECT, ordering and limit against in-memory rows.
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table agent_messages (id text, chat_id text, role text, kind text, content text, meta text, created_at text);
    insert into agent_messages values
      ('previous', 'chat', 'assistant', 'chat', 'Tidigare', null, '2026-11-27T11:10:00.000Z'),
      ('z-question', 'chat', 'user', 'chat', 'Fråga', null, '2026-11-27T11:18:11.230Z'),
      ('a-answer', 'chat', 'assistant', 'chat', 'Svar', null, '2026-11-27T11:18:11.230Z'),
      ('other', 'elsewhere', 'assistant', 'chat', 'Annan', null, '2026-11-27T11:19:00.000Z');
  `);
  const db = drizzle(async (query, params) => {
    const statement = database.prepare(query);
    statement.setReturnArrays(true);
    const bindings = Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value]));
    return { rows: statement.all(bindings) };
  });
  return { db, dbConfigured: true };
});

import { listAgentMessages } from "./agent-messages";

it("reads the latest pair in question–answer order even when their random ids sort backwards", async () => {
  expect((await listAgentMessages("chat", 2)).map((row) => row.id)).toEqual(["z-question", "a-answer"]);
  expect((await listAgentMessages("chat", 1)).map((row) => row.id)).toEqual(["a-answer"]);
});
