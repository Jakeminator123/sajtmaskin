import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/gateway-policy";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  siteType: z.string().max(100).optional(),
  companyDescription: z.string().max(3000).optional(),
  scrapeText: z.string().max(3000).optional(),
});

const AVAILABLE_SECTIONS = [
  "Startsida / Hero",
  "Om oss / Om mig",
  "Kontaktformulär",
  "Webshop / Produkter",
  "Priser och paket",
  "Bokning online",
  "Bildgalleri",
  "Meny / Matsedel",
  "Blogg / Nyheter",
  "Kundrecensioner",
  "Vanliga frågor (FAQ)",
  "Portfolio / Case",
  "Vårt team",
  "Karta / Hitta hit",
  "Sociala medier-länkar",
  "Nyhetsbrev-signup",
  "Video / Presentation",
  "Tydlig CTA-knapp",
  "Logga in / Konto",
  "Tjänsteöversikt",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const { siteType, companyDescription, scrapeText } = parsed.data;

    const contextParts: string[] = [];
    if (siteType) contextParts.push(`Typ av sajt: ${siteType}`);
    if (companyDescription) contextParts.push(`Beskrivning: ${companyDescription}`);
    if (scrapeText) contextParts.push(`Skrapad info:\n${scrapeText.slice(0, 2000)}`);

    if (contextParts.length === 0) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const result = await generateText({
      model: createDirectModel("openai/gpt-5.4-mini"),
      system: `Du är en expert på webbdesign för svenska företag. Baserat på information om ett företag, välj exakt de sidor/sektioner som bäst passar deras hemsida.

Tillgängliga val:
${AVAILABLE_SECTIONS.map((s, i) => `${i}. ${s}`).join("\n")}

Svara BARA med en JSON-array av de exakta namnen (strängar) som passar bäst. Välj 4-8 stycken. Inkludera alltid "Startsida / Hero". Returnera BARA JSON-arrayen, inget annat.`,
      prompt: contextParts.join("\n\n"),
      temperature: 0.3,
    });

    try {
      const raw = result.text.trim();
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return NextResponse.json({ suggestions: [] });

      const arr = JSON.parse(jsonMatch[0]) as string[];
      const valid = arr.filter((s) => AVAILABLE_SECTIONS.includes(s));
      return NextResponse.json({ suggestions: valid });
    } catch {
      return NextResponse.json({ suggestions: [] });
    }
  } catch (err) {
    console.error("[API/ai/suggest-pages]", err);
    return NextResponse.json({ suggestions: [] });
  }
}
