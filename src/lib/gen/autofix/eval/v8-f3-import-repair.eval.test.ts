/**
 * v8-eval (stabilisering våg 1): the FULL missing-import pattern class from
 * prod chat `cc10e7de` version `4a29c7b4` (2026-07-03, "Neon Glassblowing
 * 2400") through the deterministic import repair.
 *
 * The five blocking findings that failed the version — all still-failing
 * after autofix + LLM repair in prod:
 *
 *   1. app/api/checkout/route.ts   — `new Stripe(...)`  TS2552, no import
 *   2. app/api/contact/route.ts    — `new Resend(...)`  TS2552, no import
 *   3. components/future-gear-shop — `toast.*`          TS2304, no import
 *   4. app/page.tsx                — `<Badge>/<Button>` TS2304, no imports
 *   5. components/contact-form.tsx — `FormEvent<HTMLFormElement>` flagged as
 *      `undefined-jsx-symbol` (verifier-scan FALSE POSITIVE — the file is
 *      valid; fixed in checkUndefinedJsxSymbols, asserted here end-to-end)
 *
 * Fixtures are minimized excerpts of the REAL persisted v8 files
 * (docs/plans/active/stort-framsteg/version-4a29c7b4.zip). Expected after
 * the wave-1 fixes: 0 residual TS2304/TS2552 for the known set in F3, 0
 * `undefined-jsx-symbol`, and the tier-3 gate still blocking Stripe/Resend
 * in F2.
 */
import { describe, expect, it } from "vitest";
import { parseCodeProject } from "@/lib/gen/parser";
import { checkUndefinedJsxSymbols } from "@/lib/gen/verify/verifier-pass";
import {
  runDeterministicImportRepair,
  type DeterministicImportRepairDiagnostic,
} from "../deterministic-import-repair";

function file(path: string, content: string, lang = "tsx"): string {
  return `\`\`\`${lang} file="${path}"\n${content}\n\`\`\``;
}

function getFileContent(content: string, path: string): string {
  const found = parseCodeProject(content).files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Expected file ${path} in CodeProject fixture.`);
  return found.content;
}

// ── Minimized v8 fixtures (real prod shapes) ────────────────────────────────

const CHECKOUT_ROUTE = `import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return NextResponse.json({ message: "Stripe är inte konfigurerat ännu." }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "sv",
    success_url: new URL(request.url).origin,
  });

  return NextResponse.json({ url: session.url });
}`;

const CONTACT_ROUTE = `import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return NextResponse.json({ message: "E-postintegrationen saknar miljövariabler." }, { status: 500 });
  }

  const resend = new Resend(resendApiKey);

  await resend.emails.send({
    from: "studio@example.com",
    to: ["hello@example.com"],
    subject: "Ny förfrågan",
    text: String(await request.text()),
  });

  return NextResponse.json({ message: "Meddelandet har skickats." });
}`;

const FUTURE_GEAR_SHOP = `"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FutureGearShop() {
  const [pending, setPending] = useState(false);

  async function startCheckout(gearId: string) {
    setPending(true);
    toast.loading("Skickar dig till Stripe Checkout...", { id: "stripe-checkout" });
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ gearId }),
      });
      if (!response.ok) throw new Error("Checkout misslyckades.");
      toast.success("Betalningen är genomförd. Tack för din framtidsorder!");
    } catch (error) {
      toast.dismiss("stripe-checkout");
      toast.error(error instanceof Error ? error.message : "Något gick fel.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <Badge className="rounded-full">Framtidsbutik</Badge>
      <Button disabled={pending} onClick={() => startCheckout("nova-pipe")}>
        Köp
      </Button>
    </section>
  );
}`;

// Multi-line lucide import + Badge/Button JSX with no shadcn imports — the
// exact shape whose fixes the guarded import-validator used to revert (M#imp1).
const PAGE = `import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Gem,
  Hammer,
  MapPin,
  Waves,
  Zap,
} from "lucide-react";

const services = [
  { title: "Neonobjekt & ljusskulpturer", icon: Gem, tag: "Objekt" },
  { title: "Skräddarsydda interiörer", icon: Hammer, tag: "Uppdrag" },
  { title: "Liveupplevelser i het zon", icon: Flame, tag: "Workshop" },
];

export default function Page() {
  return (
    <main>
      <Badge className="mb-6 rounded-full">Ett hantverk som lyser genom tiden</Badge>
      <Button asChild size="lg">
        <Link href="/#kontakt">
          Boka glasupplevelse <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      {services.map((service) => (
        <service.icon key={service.title} className="h-5 w-5" />
      ))}
      <Image src="/hero.png" alt="" width={1200} height={600} />
    </main>
  );
}`;

// VALID prod file — the type-generic annotation the verifier scan used to
// flag as an unfixable `undefined-jsx-symbol` blocker (M#jsx1 false positive).
const CONTACT_FORM = `"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!new FormData(form).get("name")) {
      toast.error("Fyll i namn, e-post, ärendetyp och meddelande.");
      return;
    }
    setIsSubmitting(true);
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Button type="submit" disabled={isSubmitting}>
        Skicka förfrågan
      </Button>
    </form>
  );
}`;

const V8_PROJECT = [
  file("app/api/checkout/route.ts", CHECKOUT_ROUTE, "ts"),
  file("app/api/contact/route.ts", CONTACT_ROUTE, "ts"),
  file("components/future-gear-shop.tsx", FUTURE_GEAR_SHOP),
  file("app/page.tsx", PAGE),
  file("components/contact-form.tsx", CONTACT_FORM),
].join("\n\n");

// The real tsc output from prod (quality-gate:typecheck meta, 09:34:22Z),
// deduplicated per file+name the way both repair entrypoints bucket them.
const V8_DIAGNOSTICS: DeterministicImportRepairDiagnostic[] = [
  {
    file: "app/api/checkout/route.ts",
    message: "Cannot find name 'Stripe'. Did you mean 'stripe'?",
  },
  {
    file: "app/api/contact/route.ts",
    message: "Cannot find name 'Resend'. Did you mean 'resend'?",
  },
  { file: "components/future-gear-shop.tsx", message: "Cannot find name 'toast'." },
  { file: "app/page.tsx", message: "Cannot find name 'Badge'." },
  { file: "app/page.tsx", message: "Cannot find name 'Button'." },
];

describe("v8-eval: prod cc10e7de missing-import class through deterministic repair", () => {
  it("F3 (fidelity3): resolves ALL five known findings with zero residual", () => {
    const result = runDeterministicImportRepair(V8_PROJECT, V8_DIAGNOSTICS, {
      previewPolicy: "fidelity3",
    });

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toEqual(expect.arrayContaining(["TS2552", "TS2304"]));

    expect(getFileContent(result.content, "app/api/checkout/route.ts")).toContain(
      'import Stripe from "stripe"',
    );
    expect(getFileContent(result.content, "app/api/contact/route.ts")).toContain(
      'import { Resend } from "resend"',
    );
    expect(getFileContent(result.content, "components/future-gear-shop.tsx")).toContain(
      'import { toast } from "sonner"',
    );
    const page = getFileContent(result.content, "app/page.tsx");
    expect(page).toContain('import { Badge } from "@/components/ui/badge"');
    expect(page).toContain('import { Button } from "@/components/ui/button"');
    // The multi-line lucide block must survive intact — exactly one lucide import.
    expect(page.match(/from "lucide-react"/g)).toHaveLength(1);

    // Telemetry: every cannot-find name accounted for, nothing residual.
    expect(result.cannotFindSummary.seenCodes.sort()).toEqual(["TS2304", "TS2552"]);
    expect(result.cannotFindSummary.residual).toEqual([]);
    expect(result.cannotFindSummary.resolvedNames.sort()).toEqual([
      "app/api/checkout/route.ts::Stripe",
      "app/api/contact/route.ts::Resend",
      "app/page.tsx::Badge",
      "app/page.tsx::Button",
      "components/future-gear-shop.tsx::toast",
    ]);

    // The valid contact-form must be byte-identical (nothing to fix).
    expect(getFileContent(result.content, "components/contact-form.tsx")).toBe(
      CONTACT_FORM,
    );

    // And the verifier's deterministic scan on the repaired project reports
    // ZERO undefined-jsx-symbol findings — including the former
    // `FormEvent<HTMLFormElement>` false positive (M#jsx1).
    const findings = checkUndefinedJsxSymbols(parseCodeProject(result.content).files);
    expect(findings).toEqual([]);
  });

  it("F2 (fidelity2): tier-3 gate keeps Stripe/Resend residual (reason: tier3_gated), rest resolves", () => {
    const result = runDeterministicImportRepair(V8_PROJECT, V8_DIAGNOSTICS, {
      previewPolicy: "fidelity2",
    });

    expect(result.fixed).toBe(true);
    // Never re-introduce tier-3 backend SDK imports in a design preview.
    expect(getFileContent(result.content, "app/api/checkout/route.ts")).not.toContain(
      'from "stripe"',
    );
    expect(getFileContent(result.content, "app/api/contact/route.ts")).not.toContain(
      'from "resend"',
    );
    // Non-tier-3 names still resolve in F2.
    expect(getFileContent(result.content, "components/future-gear-shop.tsx")).toContain(
      'import { toast } from "sonner"',
    );
    expect(getFileContent(result.content, "app/page.tsx")).toContain(
      'import { Badge } from "@/components/ui/badge"',
    );

    // Telemetry names the gate as the reason — this is the signal that was
    // missing when prod v8 ran its repair in an F2 lane (M#imp1).
    expect(result.cannotFindSummary.residual).toEqual(
      expect.arrayContaining([
        { file: "app/api/checkout/route.ts", name: "Stripe", reason: "tier3_gated" },
        { file: "app/api/contact/route.ts", name: "Resend", reason: "tier3_gated" },
      ]),
    );
    expect(result.cannotFindSummary.residual).toHaveLength(2);
  });

  it("default (no previewPolicy): F2-safe — Stripe/Resend stay residual", () => {
    const result = runDeterministicImportRepair(V8_PROJECT, V8_DIAGNOSTICS);

    expect(result.content).not.toContain('from "stripe"');
    expect(result.content).not.toContain('from "resend"');
  });
});
