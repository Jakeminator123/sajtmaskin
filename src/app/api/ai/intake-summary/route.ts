import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getAllScaffolds } from "@/lib/gen/scaffolds/registry";

export const runtime = "nodejs";
export const maxDuration = 15;

const requestSchema = z.object({
  prompt: z.string().min(1).max(10_000),
  siteType: z.string().max(100).optional(),
  scrapeText: z.string().max(5_000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      );
    }

    const { prompt, siteType } = parsed.data;

    const buildIntent = "website" as const;
    const matched = matchScaffold(prompt, buildIntent);

    const scaffold = matched
      ? {
          id: matched.id,
          label: matched.label,
          description: matched.description,
          promptHints: matched.promptHints ?? [],
        }
      : {
          id: "base-nextjs",
          label: "Standard",
          description: "Generell Next.js-sajt",
          promptHints: [],
        };

    const integrations: string[] = [];
    const lower = prompt.toLowerCase();
    const integrationKeywords: [string, string][] = [
      ["betalning", "Stripe"],
      ["stripe", "Stripe"],
      ["webshop", "Stripe"],
      ["e-handel", "Stripe"],
      ["analytics", "Google Analytics"],
      ["analys", "Google Analytics"],
      ["statistik", "Google Analytics"],
      ["karta", "Google Maps"],
      ["hitta hit", "Google Maps"],
      ["maps", "Google Maps"],
      ["bokning", "Cal.com"],
      ["boka", "Cal.com"],
      ["nyhetsbrev", "Resend"],
      ["email", "Resend"],
      ["databas", "Supabase"],
      ["auth", "NextAuth"],
      ["logga in", "NextAuth"],
      ["inlogg", "NextAuth"],
    ];

    for (const [keyword, integration] of integrationKeywords) {
      if (lower.includes(keyword) && !integrations.includes(integration)) {
        integrations.push(integration);
      }
    }

    const suggestedPages: string[] = ["Startsida"];
    const allScaffolds = getAllScaffolds();
    const matchedFull = allScaffolds.find((s) => s.id === scaffold.id);
    if (matchedFull?.files) {
      const pageFiles = matchedFull.files
        .map((f) => f.path)
        .filter((p) => p.match(/^(src\/)?app\//) && p.endsWith("/page.tsx") && !p.includes("api/"));
      for (const f of pageFiles) {
        const pageName = f.replace(/^(src\/)?app\//, "").replace("/page.tsx", "");
        if (pageName && pageName !== "(marketing)" && pageName !== "") {
          suggestedPages.push(pageName.charAt(0).toUpperCase() + pageName.slice(1));
        }
      }
    }

    return NextResponse.json({
      scaffold,
      integrations,
      suggestedPages,
    });
  } catch (err) {
    console.error("[API/ai/intake-summary] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
