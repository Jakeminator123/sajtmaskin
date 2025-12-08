/**
 * Domain Suggestions API
 *
 * Generates domain name suggestions based on company/project info
 * and checks availability using RDAP (free WHOIS alternative).
 *
 * POST /api/domain-suggestions
 * Body: { companyName: string, industry?: string, keywords?: string[] }
 * Returns: { suggestions: { domain: string, available: boolean | null, checking: boolean }[] }
 */

import { NextRequest, NextResponse } from "next/server";

// Allow 30 seconds for domain checks
export const maxDuration = 30;

interface DomainSuggestion {
  domain: string;
  available: boolean | null; // null = could not check
  tld: string;
}

// Generate domain suggestions using GPT
async function generateDomainNames(
  companyName: string,
  industry?: string,
  keywords?: string[]
): Promise<string[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    // Fallback: generate simple suggestions without AI
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 15);
    return [base, `${base}app`, `get${base}`, `${base}hq`, `my${base}`];
  }

  const prompt = `Generate 5 creative, memorable domain name suggestions for a company/project.

Company/Project: ${companyName}
${industry ? `Industry: ${industry}` : ""}
${keywords?.length ? `Keywords: ${keywords.join(", ")}` : ""}

Requirements:
- Short (ideally 6-12 characters)
- Easy to spell and remember
- Professional sounding
- No hyphens or numbers unless necessary
- Can be creative wordplay or combinations

Return ONLY a JSON array of 5 domain names (without TLD), like:
["example1", "example2", "example3", "example4", "example5"]`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a domain name expert. Return only valid JSON arrays.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error("[domain-suggestions] OpenAI error:", response.status);
      throw new Error("OpenAI API error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const names = JSON.parse(jsonMatch[0]);
      return names.map((n: string) =>
        n.toLowerCase().replace(/[^a-z0-9-]/g, "")
      );
    }

    throw new Error("Could not parse domain names");
  } catch (error) {
    console.error("[domain-suggestions] Error generating names:", error);
    // Fallback
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 15);
    return [base, `${base}app`, `get${base}`, `${base}hq`, `my${base}`];
  }
}

// Check domain availability using RDAP (Registration Data Access Protocol)
// This is the modern replacement for WHOIS, free and no API key needed
async function checkDomainAvailability(
  domain: string
): Promise<boolean | null> {
  try {
    // Use RDAP for .com, .net, .org domains
    const tld = domain.split(".").pop();

    // Different RDAP servers for different TLDs
    const rdapServers: Record<string, string> = {
      com: "https://rdap.verisign.com/com/v1/domain/",
      net: "https://rdap.verisign.com/net/v1/domain/",
      org: "https://rdap.publicinterestregistry.org/rdap/domain/",
      io: "https://rdap.nic.io/domain/",
      app: "https://rdap.nic.google/domain/",
      co: "https://rdap.nic.co/domain/",
    };

    // For .se domains, use a different approach (DNS lookup)
    if (tld === "se") {
      return await checkDomainViaDns(domain);
    }

    const rdapServer = rdapServers[tld || ""];
    if (!rdapServer) {
      // Fallback to DNS check for unsupported TLDs
      return await checkDomainViaDns(domain);
    }

    const response = await fetch(`${rdapServer}${domain}`, {
      method: "GET",
      headers: {
        Accept: "application/rdap+json",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    // 404 = domain not found = available
    // 200 = domain exists = taken
    if (response.status === 404) {
      return true; // Available
    } else if (response.ok) {
      return false; // Taken
    }

    return null; // Could not determine
  } catch (error) {
    console.error(
      `[domain-suggestions] RDAP check failed for ${domain}:`,
      error
    );
    // Try DNS fallback
    return await checkDomainViaDns(domain);
  }
}

// Fallback: Check via DNS lookup
async function checkDomainViaDns(domain: string): Promise<boolean | null> {
  try {
    // Use Google's DNS-over-HTTPS to check if domain has any records
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`,
      {
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // If Status is 3 (NXDOMAIN), domain doesn't exist = might be available
    // If Status is 0 and has Answer, domain exists = taken
    if (data.Status === 3) {
      return true; // Likely available (no DNS records)
    } else if (data.Status === 0 && data.Answer) {
      return false; // Taken (has DNS records)
    }

    return null; // Could not determine
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, industry, keywords } = body;

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json(
        { error: "companyName is required" },
        { status: 400 }
      );
    }

    console.log(
      "[domain-suggestions] Generating suggestions for:",
      companyName
    );

    // Generate domain name bases
    const baseNames = await generateDomainNames(
      companyName,
      industry,
      keywords
    );

    // Create full domain suggestions with different TLDs
    const suggestions: DomainSuggestion[] = [];

    // Prioritize .se and .com for each name
    for (const name of baseNames.slice(0, 5)) {
      for (const tld of [".se", ".com"]) {
        if (suggestions.length < 8) {
          suggestions.push({
            domain: `${name}${tld}`,
            available: null,
            tld,
          });
        }
      }
    }

    // Check availability in parallel (but with some rate limiting)
    const checkPromises = suggestions.map(async (suggestion, index) => {
      // Stagger requests slightly to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, index * 200));
      const available = await checkDomainAvailability(suggestion.domain);
      return { ...suggestion, available };
    });

    const checkedSuggestions = await Promise.all(checkPromises);

    console.log(
      "[domain-suggestions] Checked",
      checkedSuggestions.length,
      "domains"
    );

    return NextResponse.json({
      success: true,
      suggestions: checkedSuggestions,
    });
  } catch (error) {
    console.error("[domain-suggestions] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate domain suggestions" },
      { status: 500 }
    );
  }
}
