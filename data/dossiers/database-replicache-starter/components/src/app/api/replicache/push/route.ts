import { NextRequest, NextResponse } from 'next/server';

type Mutation = {
  id: number;
  clientID: string;
  name: string;
  args: any;
};

type PushBody = {
  pushVersion: number;
  schemaVersion: string;
  profileID: string;
  clientGroupID: string;
  mutations: Mutation[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PushBody;

  // Replace this with a transaction against your database.
  // For each mutation:
  // 1. verify ordering using the stored lastMutationID for clientID
  // 2. apply the mutation to canonical server state
  // 3. bump the global version / change log
  // 4. persist the new lastMutationID for clientID
  for (const mutation of body.mutations) {
    switch (mutation.name) {
      case 'createTodo':
      case 'updateTodo':
      case 'deleteTodos':
      case 'completeTodos':
        break;
      default:
        return NextResponse.json(
          {error: `Unknown mutation: ${mutation.name}`},
          {status: 400}
        );
    }
  }

  return NextResponse.json({ok: true});
}
