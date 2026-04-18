import { createSandbox } from "@/lib/sandbox/utils";

export async function POST() {
  try {
    const sandbox = await createSandbox();

    return Response.json({
      sandboxId: sandbox.sandboxId
    });
  } catch (error) {
    console.error("Failed to create sandbox", error);
    return Response.json({ error: "Failed to create sandbox" }, { status: 500 });
  }
}
