# When to use

Use Replicache when the app needs:

- optimistic UI with immediate local writes
- sync between devices or collaborators
- offline-tolerant interactions
- a server-owned canonical database with client-side cache replication

Good fits: task apps, internal tools, field apps, dashboards with editable records, lightweight collaborative CRUD.

Avoid it for simple read-only content or forms that do not benefit from local-first sync.

# How to integrate

## 1) Create a Replicache client

Create one client per signed-in user or workspace-scoped data set. The `name` should be stable for that logical cache.

```ts
import { createReplicache } from '@/src/lib/replicache';

const rep = createReplicache({
  name: `user-${userId}`,
  pushURL: '/api/replicache/push',
  pullURL: '/api/replicache/pull',
});
```

The included `components/src/lib/replicache.ts` defines mutators for:

- `createTodo`
- `updateTodo`
- `deleteTodos`
- `completeTodos`

These mutators update the local cache first; the server must later accept the same mutation names and args in `push`.

## 2) Read data from the local cache

Use Replicache subscriptions in client components.

```tsx
'use client';

import { useEffect, useMemo } from 'react';
import { useSubscribe } from 'replicache-react';
import { createReplicache } from '@/src/lib/replicache';

export function TodoListClient({ userId }: { userId: string }) {
  const rep = useMemo(() => createReplicache({ name: `user-${userId}` }), [userId]);

  const todos = useSubscribe(
    rep,
    async (tx) => {
      const items = await tx.scan({ prefix: 'todo/' }).entries().toArray();
      return items.map(([, value]) => value as { id: string; text: string; completed: boolean });
    },
    { default: [] }
  );

  useEffect(() => {
    return () => {
      rep.close();
    };
  }, [rep]);

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

## 3) Write through mutators only

Do not call your database directly from the client for replicated entities.

```ts
await rep.mutate.createTodo({
  id: crypto.randomUUID(),
  text: 'Ship sync feature',
});

await rep.mutate.updateTodo({
  id: todoId,
  completed: true,
});

await rep.mutate.deleteTodos({
  ids: [todoId],
});
```

## 4) Implement the server push endpoint

`/api/replicache/push` must:

- authenticate the user
- validate mutation ordering using stored `lastMutationID` per `clientID`
- apply mutations transactionally to canonical DB state
- append change-log entries or otherwise track row version changes
- persist updated `lastMutationID`

Skeleton:

```ts
for (const mutation of body.mutations) {
  const expected = (lastMutationID[mutation.clientID] ?? 0) + 1;

  if (mutation.id < expected) {
    continue; // already processed
  }
  if (mutation.id > expected) {
    throw new Error('Mutation out of order');
  }

  switch (mutation.name) {
    case 'createTodo':
      // insert row
      break;
    case 'updateTodo':
      // update row
      break;
    case 'deleteTodos':
      // delete rows
      break;
    case 'completeTodos':
      // bulk update
      break;
  }

  // store lastMutationID[clientID] = mutation.id
  // bump global version / record changed keys
}
```

## 5) Implement the server pull endpoint

`/api/replicache/pull` must return:

- `lastMutationIDChanges`: map of client IDs to acknowledged mutation IDs
- `cookie`: the latest server version seen by the client
- `patch`: list of `put` / `del` operations since the prior cookie

Skeleton:

```ts
return {
  lastMutationIDChanges,
  cookie: currentVersion,
  patch: [
    { op: 'put', key: `todo/${todo.id}`, value: todo },
    { op: 'del', key: `todo/${deletedId}` },
  ],
};
```

Use a monotonically increasing version number, timestamp cursor, or equivalent change sequence. The cookie must represent the exact replication checkpoint.

## 6) Map keys consistently

Use deterministic keys in the local cache, for example:

- `todo/<id>` for todo items
- `project/<id>` for project entities
- `membership/<id>` for access-control related replicated records

Changing key format later is a schema migration.

## 7) Back with your database

Replicache is not your source of truth. Persist data in your database and generate pull patches from the server-side state/change log.

Common setups:

- Postgres/Supabase with a change-log table
- Prisma on Postgres with per-row versioning
- custom SQL tables tracking `space_id`, `version`, `deleted`

# UX rules

- Treat writes as instant: update via mutators and let sync reconcile.
- Show sync state subtly, not with blocking spinners for every mutation.
- Scope caches per user/workspace so data does not bleed across accounts.
- Preserve usability offline; queue writes and surface only meaningful sync errors.
- Prefer idempotent mutation handlers and deterministic server application.
- For collaborative views, explain that remote changes may appear after sync, not necessarily instantly.

You can keep lightweight helper UI like the included footer filter component, but do not ship the full TodoMVC demo unless the user explicitly wants it.

# Avoid

- Do not use Replicache as the only persistent store.
- Do not mutate replicated records from the client outside Replicache mutators.
- Do not omit mutation ordering checks in `push`.
- Do not generate `pull` responses from ad hoc full-table dumps once data volume grows; use incremental change tracking.
- Do not share one Replicache `name` across unrelated users or workspaces.
- Do not return inconsistent keys between mutators and pull patches.
- Do not keep template-specific TodoMVC components that depend on missing files (`todo-text-input`, `todo-list`, `../todo`).

# Verification

Verify the integration with this checklist:

1. Create a record while online; it appears immediately before network round-trip completes.
2. Refresh the page; the record is still present after pull from the server.
3. Open a second tab or device; changes replicate after sync.
4. Disable the network, create/update/delete records, then reconnect; queued mutations are pushed successfully.
5. Confirm `push` rejects unknown mutation names and enforces ordered mutation IDs.
6. Confirm `pull` returns only changes since the last cookie.
7. Confirm user A cannot pull or push user B's replicated data.
8. Confirm deleting a record results in a `del` patch or equivalent tombstone handling.

Minimal manual smoke test:

```ts
await rep.mutate.createTodo({ id: crypto.randomUUID(), text: 'offline test' });
await rep.mutate.completeTodos({ ids: [todoId], completed: true });
```

Then inspect:

- local cache updates instantly
- `POST /api/replicache/push` receives the mutations
- `POST /api/replicache/pull` returns matching `put`/`del` patches
- canonical DB state matches the final client state
