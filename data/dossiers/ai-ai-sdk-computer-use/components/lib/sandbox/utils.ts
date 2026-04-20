import { Sandbox } from "@vercel/sandbox";

const snapshotId = process.env.SANDBOX_SNAPSHOT_ID;

if (!snapshotId) {
  throw new Error("Missing SANDBOX_SNAPSHOT_ID environment variable");
}

export async function getSandbox(sandboxId: string) {
  return Sandbox.connect(sandboxId);
}

export async function createSandbox() {
  return Sandbox.create({
    snapshotId
  });
}

export async function killDesktop(sandboxId: string) {
  const sandbox = await getSandbox(sandboxId);
  await sandbox.stop();
}
