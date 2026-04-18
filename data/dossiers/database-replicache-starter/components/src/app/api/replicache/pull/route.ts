import { NextRequest, NextResponse } from 'next/server';

type PullBody = {
  pullVersion: number;
  schemaVersion: string;
  profileID: string;
  cookie: number | null;
  clientGroupID: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PullBody;
  const fromVersion = body.cookie ?? 0;

  // Replace these with reads from your database and change log.
  const lastMutationIDChanges: Record<string, number> = {};
  const patch: Array<
    | {op: 'put'; key: string; value: unknown}
    | {op: 'del'; key: string}
  > = [];
  const currentVersion = fromVersion;

  return NextResponse.json({
    lastMutationIDChanges,
    cookie: currentVersion,
    patch,
  });
}
