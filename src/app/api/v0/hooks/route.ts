import { NextResponse } from "next/server";
import { z } from "zod";
import { assertV0Key, v0 } from "@/lib/v0";
import { withRateLimit } from "@/lib/rateLimit";

const hookEventSchema = z.enum([
  "chat.created",
  "chat.updated",
  "chat.deleted",
  "message.created",
  "message.updated",
  "message.deleted",
  "message.finished",
]);

const createHookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(hookEventSchema).min(1),
  chatId: z.string().optional(),
});

export async function GET(req: Request) {
  return withRateLimit(req, "hooks:find", async () => {
    try {
      assertV0Key();
      const result = await v0.hooks.find();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: Request) {
  return withRateLimit(req, "hooks:create", async () => {
    try {
      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const validationResult = createHookSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const result = await v0.hooks.create(validationResult.data);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
