import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type StagehandRequest = {
  instruction: string;
  url?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { instruction, url }: StagehandRequest = await req.json();

    if (!instruction) {
      return NextResponse.json(
        { error: "Missing instruction" },
        { status: 400 },
      );
    }

    if (!process.env.BROWSERBASE_API_KEY) {
      return NextResponse.json(
        { error: "Missing BROWSERBASE_API_KEY" },
        { status: 500 },
      );
    }

    const modelApiKey =
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.CEREBRAS_API_KEY;

    if (!modelApiKey) {
      return NextResponse.json(
        {
          error:
            "Missing LLM API key. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, or CEREBRAS_API_KEY.",
        },
        { status: 500 },
      );
    }

    // Replace this dynamic import and setup with the exact Stagehand package/API
    // version used in the project being generated.
    const { Stagehand } = await import("@browserbasehq/stagehand");

    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      modelName: process.env.STAGEHAND_MODEL || "gpt-4o",
      headless: process.env.HEADLESS !== "false",
      verbose: 1,
      enableCaching: process.env.ENABLE_CACHING === "true",
    });

    await stagehand.init();

    if (url) {
      await stagehand.page.goto(url);
    }

    const result = await stagehand.page.extract({
      instruction,
    });

    await stagehand.close();

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Stagehand request failed" },
      { status: 500 },
    );
  }
}
