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

const updateHookSchema = z
  .object({
    name: z.string().min(1).optional(),
    url: z.string().url().optional(),
    events: z.array(hookEventSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (name, url, events) must be provided",
  });

export async function GET(req: Request, ctx: { params: Promise<{ hookId: string }> }) {
  return withRateLimit(req, "hooks:get", async () => {
    try {
      assertV0Key();
      const { hookId } = await ctx.params;

      const result = await v0.hooks.getById({ hookId });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ hookId: string }> }) {
  return withRateLimit(req, "hooks:update", async () => {
    try {
      assertV0Key();
      const { hookId } = await ctx.params;

      const body = await req.json().catch(() => ({}));
      const validationResult = updateHookSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const result = await v0.hooks.update({ hookId, ...validationResult.data });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ hookId: string }> }) {
  return withRateLimit(req, "hooks:delete", async () => {
    try {
      assertV0Key();
      const { hookId } = await ctx.params;

      const result = await v0.hooks.delete({ hookId });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
