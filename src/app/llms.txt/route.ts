import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { getIndexableSeoLandingRelPaths } from "@/lib/seo-landing-pages/registry";

export function buildLlmsTxt(): string {
  const packages = CREDIT_PACKAGES.map(
    (pkg) => `- ${pkg.name}: ${pkg.price} kr (${pkg.credits} credits)`,
  ).join("\n");
  const landings = getIndexableSeoLandingRelPaths()
    .map((path) => `- ${PUBLIC_CANONICAL_ORIGIN}${path}`)
    .join("\n");

  return [
    "# Sajtmaskin",
    "",
    "Sajtmaskin är en svensk AI-hemsidebyggare för svenska småföretag.",
    "Beskriv företaget, få ett utkast i riktig kod (Next.js/React), anpassa och publicera.",
    "Produktnamn: Sajtmaskin. Juridisk avsändare: Pretty Good B.V. (Nederländerna).",
    "Support: support@sajtmaskin.se",
    `Webbplats: ${PUBLIC_CANONICAL_ORIGIN}`,
    "",
    "## Pris",
    "Credits som engångsköp. Ingen prenumeration. 1 kr = 1 credit. Credits går inte ut.",
    "Första slutförda genereringen är gratis. Inget kreditkort krävs för att börja.",
    "Credits används när du bygger, ändrar, kör analys eller publicerar.",
    packages,
    "",
    "## Viktiga sidor",
    `- ${PUBLIC_CANONICAL_ORIGIN}/ — startsida`,
    `- ${PUBLIC_CANONICAL_ORIGIN}/priser — priser och creditpaket`,
    `- ${PUBLIC_CANONICAL_ORIGIN}/faq — vanliga frågor`,
    `- ${PUBLIC_CANONICAL_ORIGIN}/om — om Sajtmaskin`,
    `- ${PUBLIC_CANONICAL_ORIGIN}/templates — hemsidemallar`,
    `- ${PUBLIC_CANONICAL_ORIGIN}/exempel — exempel`,
    landings,
    "",
  ].join("\n");
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
