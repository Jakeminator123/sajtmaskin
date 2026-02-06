"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar, ShaderBackground } from "@/components/layout";
import { AuthModal } from "@/components/auth";
import { useAuth } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Coins,
  ArrowLeft,
  CheckCircle,
  Wand2,
  Loader2,
  Star,
  Zap,
  Building2,
  Mail,
  Send,
  Sparkles,
  Globe,
  ShoppingCart,
  Palette,
  Phone,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

// ─── Credit Packages ──────────────────────────────────────────────
const PACKAGES = [
  { id: "10_credits", name: "Starter", diamonds: 10, price: 49, popular: false, savings: 0 },
  { id: "25_credits", name: "Popular", diamonds: 25, price: 99, popular: true, savings: 19 },
  { id: "50_credits", name: "Pro", diamonds: 50, price: 179, popular: false, savings: 27 },
];

// ─── SajtStudio Pricing Tiers ─────────────────────────────────────
const STUDIO_TIERS = [
  {
    name: "Start",
    range: "5 000 – 10 000 kr",
    description: "1-5 sidor, standardmall, grundläggande anpassning",
    features: ["Kontaktformulär", "Responsiv design", "Grundläggande SEO"],
  },
  {
    name: "Plus",
    range: "10 000 – 20 000 kr",
    description: "5-10 sidor, mer anpassning och funktionalitet",
    features: ["Allt i Start", "Blogg/nyheter", "Nyhetsbrev", "Utökad SEO"],
  },
  {
    name: "Pro",
    range: "20 000 – 40 000+ kr",
    description: "Unika lösningar, integrationer och e-handel",
    features: ["Allt i Plus", "E-handel", "API-integrationer", "Specialutveckling"],
  },
];

// ─── Project Type Options ─────────────────────────────────────────
const PROJECT_TYPES = [
  { id: "new", label: "Ny webbplats", icon: Globe },
  { id: "redesign", label: "Redesign", icon: Palette },
  { id: "landing", label: "Landningssida", icon: Sparkles },
  { id: "ecommerce", label: "E-handel", icon: ShoppingCart },
  { id: "other", label: "Annat", icon: Building2 },
];

// ─── Contact emails (displayed vs actual) ─────────────────────────
const DISPLAY_EMAIL = "hej@sajtmaskin.se";
const MAILTO_RECIPIENTS = "jakob.olof.eberg@gmail.com,erik@sajtstudio.se";

// ─── Generate mailto link from form data ──────────────────────────
function buildMailtoLink(data: {
  name: string;
  company: string;
  email: string;
  phone: string;
  projectTypes: string[];
  currentUrl: string;
  description: string;
  budget: string;
  timeline: string;
  notes: string;
}): string {
  const subject = encodeURIComponent(
    `Projektförfrågan via SajtMaskin – ${data.company || data.name}`,
  );

  const lines = [
    `Hej SajtStudio!`,
    ``,
    `Jag vill gärna diskutera ett webbprojekt.`,
    ``,
    `── KONTAKTUPPGIFTER ──`,
    `Namn: ${data.name}`,
    `Företag: ${data.company || "–"}`,
    `E-post: ${data.email}`,
    `Telefon: ${data.phone || "–"}`,
    ``,
    `── OM PROJEKTET ──`,
    `Typ: ${data.projectTypes.length > 0 ? data.projectTypes.join(", ") : "–"}`,
    `Nuvarande webb: ${data.currentUrl || "–"}`,
    `Beskrivning: ${data.description || "–"}`,
    ``,
    `── BUDGET & TIDPLAN ──`,
    `Budgetram: ${data.budget || "–"}`,
    `Tidplan: ${data.timeline || "–"}`,
    `Övrigt: ${data.notes || "–"}`,
    ``,
    `──`,
    `Skickat via sajtmaskin.se`,
  ];

  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${MAILTO_RECIPIENTS}?subject=${subject}&body=${body}`;
}

// ═══════════════════════════════════════════════════════════════════
// Main Content Component
// ═══════════════════════════════════════════════════════════════════
function BuyCreditsContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated, diamonds, fetchUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"credits" | "studio">("credits");

  // ─── SajtStudio form state ────────────────────────────────────
  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    projectTypes: [] as string[],
    currentUrl: "",
    description: "",
    budget: "",
    timeline: "",
    notes: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Check URL params for success/cancel
  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");
    if (success === "true" && sessionId) {
      setSuccessMessage("Tack för ditt köp! Credits har lagts till på ditt konto.");
      fetchUser();
    }
  }, [searchParams, fetchUser]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // ─── Stripe checkout handler ──────────────────────────────────
  const handlePurchase = async (packageId: string) => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setSelectedPackage(packageId);
    setIsLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Kunde inte starta betalning. Försök igen.");
      }
    } catch {
      alert("Kunde inte starta betalningen");
    } finally {
      setIsLoading(false);
      setSelectedPackage(null);
    }
  };

  // ─── Form helpers ─────────────────────────────────────────────
  const toggleProjectType = useCallback((typeId: string) => {
    setFormData((prev) => ({
      ...prev,
      projectTypes: prev.projectTypes.includes(typeId)
        ? prev.projectTypes.filter((t) => t !== typeId)
        : [...prev.projectTypes, typeId],
    }));
  }, []);

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleFormSubmit = () => {
    const mailto = buildMailtoLink(formData);
    window.open(mailto, "_blank");
    setFormSubmitted(true);
  };

  const canProceedStep0 = formData.name.trim() && formData.email.trim();
  const canProceedStep1 = formData.description.trim();

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="warm" speed={0.2} opacity={0.25} />
      <Navbar
        onLoginClick={() => setShowAuthModal(true)}
        onRegisterClick={() => setShowAuthModal(true)}
      />

      <main className="relative z-10 px-4 pt-24 pb-16">
        <div className="mx-auto max-w-5xl">
          {/* Back link */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till start
          </Link>

          {/* ═══ HERO ═══ */}
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Priser{" "}
              <span className="bg-linear-to-r from-brand-teal via-brand-blue to-brand-amber bg-clip-text text-transparent animate-gradient">
                &amp; Tjänster
              </span>
            </h1>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Köp credits för AI-generering eller få professionell hjälp av SajtStudio med ditt
              webbprojekt.
            </p>

            {isAuthenticated && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 backdrop-blur-sm px-4 py-2">
                <Coins className="text-brand-amber h-4 w-4" />
                <span className="text-sm text-muted-foreground">
                  Ditt saldo:{" "}
                  <span className="text-brand-amber font-semibold">{diamonds} credits</span>
                </span>
              </div>
            )}
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-8 flex items-center gap-3 rounded-lg border border-brand-teal/30 bg-brand-teal/5 p-4">
              <CheckCircle className="text-brand-teal h-5 w-5 shrink-0" />
              <p className="text-brand-teal text-sm">{successMessage}</p>
            </div>
          )}

          {/* ═══ TAB NAVIGATION ═══ */}
          <div className="mb-10 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-card/50 backdrop-blur-sm p-1 gap-1">
              <button
                onClick={() => setActiveTab("credits")}
                className={`flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-all ${
                  activeTab === "credits"
                    ? "bg-brand-teal text-white shadow-md shadow-brand-teal/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Sparkles className="h-4 w-4" />
                AI Credits
              </button>
              <button
                onClick={() => setActiveTab("studio")}
                className={`flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-all ${
                  activeTab === "studio"
                    ? "bg-brand-blue text-white shadow-md shadow-brand-blue/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Building2 className="h-4 w-4" />
                SajtStudio Hjälp
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* CREDITS TAB                                            */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "credits" && (
            <div className="animate-fadeIn">
              {/* Package cards */}
              <div className="grid gap-6 md:grid-cols-3">
                {PACKAGES.map((pkg) => (
                  <Card
                    key={pkg.id}
                    className={`relative overflow-hidden transition-all hover-lift ${
                      pkg.popular
                        ? "border-brand-teal/50 bg-brand-teal/5 shadow-lg shadow-brand-teal/5"
                        : "border-border bg-card/80 backdrop-blur-sm"
                    }`}
                  >
                    {/* Popular badge */}
                    {pkg.popular && (
                      <div className="absolute -top-px left-0 right-0 h-0.5 bg-linear-to-r from-transparent via-brand-teal to-transparent" />
                    )}

                    <CardContent className="flex flex-col p-6">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-foreground">{pkg.name}</h3>
                        {pkg.popular && (
                          <Badge className="bg-brand-teal/10 text-brand-teal border-brand-teal/30 text-[11px]">
                            <Star className="h-3 w-3 fill-current mr-0.5" />
                            Populär
                          </Badge>
                        )}
                        {pkg.savings > 0 && !pkg.popular && (
                          <Badge variant="secondary" className="text-[11px]">
                            Spara {pkg.savings}%
                          </Badge>
                        )}
                      </div>

                      {/* Credit count */}
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-4xl font-bold text-foreground">{pkg.diamonds}</span>
                        <span className="text-muted-foreground text-sm">credits</span>
                      </div>

                      {/* Price */}
                      <div className="mb-6">
                        <span className="text-2xl font-bold text-foreground">{pkg.price} kr</span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {(pkg.price / pkg.diamonds).toFixed(1)} kr/credit
                        </span>
                      </div>

                      {/* Features */}
                      <ul className="mb-6 grow space-y-2.5">
                        <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                          <Wand2 className="text-brand-teal h-4 w-4 shrink-0" />
                          AI-generering &amp; förfining
                        </li>
                        <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                          <Zap className="text-brand-amber h-4 w-4 shrink-0" />
                          Aldrig utgångsdatum
                        </li>
                        <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                          <CheckCircle className="text-brand-teal h-4 w-4 shrink-0" />
                          Engångsköp – ingen prenumeration
                        </li>
                      </ul>

                      {/* Buy button */}
                      <Button
                        onClick={() => handlePurchase(pkg.id)}
                        disabled={isLoading}
                        className={`h-11 w-full font-medium ${
                          pkg.popular
                            ? "bg-brand-teal hover:bg-brand-teal/90 text-white"
                            : "bg-secondary hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        {isLoading && selectedPackage === pkg.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>{isAuthenticated ? "Köp nu" : "Logga in & köp"}</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pricing breakdown */}
              <div className="mt-16">
                <h2 className="mb-8 text-xl font-semibold text-foreground text-center">
                  Vad kostar det?
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 max-w-2xl mx-auto">
                  {[
                    { label: "Generering (Mini)", cost: "5", icon: Wand2, color: "text-brand-teal" },
                    { label: "Generering (Pro)", cost: "7", icon: Wand2, color: "text-brand-teal" },
                    { label: "Generering (Max)", cost: "10", icon: Wand2, color: "text-brand-teal" },
                    { label: "Förfining (Mini)", cost: "3", icon: Zap, color: "text-brand-amber" },
                    { label: "Förfining (Pro)", cost: "4", icon: Zap, color: "text-brand-amber" },
                    { label: "Förfining (Max)", cost: "6", icon: Zap, color: "text-brand-amber" },
                    {
                      label: "Wizard-läge",
                      cost: "11",
                      icon: Sparkles,
                      color: "text-brand-blue",
                    },
                    {
                      label: "Audit (Basic)",
                      cost: "15",
                      icon: Globe,
                      color: "text-brand-warm",
                    },
                    {
                      label: "Audit (Advanced)",
                      cost: "25",
                      icon: Globe,
                      color: "text-brand-warm",
                    },
                    {
                      label: "Publicering",
                      cost: "20",
                      icon: ArrowRight,
                      color: "text-muted-foreground",
                    },
                    {
                      label: "Hosting (per månad)",
                      cost: "10",
                      icon: Globe,
                      color: "text-muted-foreground",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-2.5"
                    >
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                        {item.label}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                        <Coins className="h-3.5 w-3.5 text-brand-amber" />
                        {item.cost}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Engångsköp – credits gäller för alltid, ingen prenumeration.
                </p>
              </div>

              {/* Payment footer */}
              <p className="mt-12 text-center text-sm text-muted-foreground">
                Säker betalning via Stripe. Vi accepterar Visa, Mastercard, Apple Pay &amp; Google
                Pay.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SAJTSTUDIO TAB                                         */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeTab === "studio" && (
            <div className="animate-fadeIn">
              {/* Intro */}
              <div className="text-center mb-10">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 border border-brand-blue/20">
                  <Building2 className="text-brand-blue h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-3">
                  SajtStudio – Professionell Webbhjälp
                </h2>
                <p className="mx-auto max-w-lg text-muted-foreground">
                  Behöver du mer än vad AI kan erbjuda? Vårt systerföretag{" "}
                  <a
                    href="https://www.sajtmaskin.se"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:text-brand-blue/80 inline-flex items-center gap-1 font-medium"
                  >
                    SajtStudio
                    <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  hjälper dig med skräddarsydda webbprojekt – från enklare sajter till avancerad
                  e-handel.
                </p>
              </div>

              {/* Pricing tiers */}
              <div className="grid gap-4 md:grid-cols-3 mb-12">
                {STUDIO_TIERS.map((tier, i) => (
                  <Card
                    key={tier.name}
                    className={`border-border bg-card/80 backdrop-blur-sm transition-all hover-lift ${
                      i === 1 ? "border-brand-blue/30 md:scale-[1.02]" : ""
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-foreground">{tier.name}</h3>
                        {i === 1 && (
                          <Badge className="bg-brand-blue/10 text-brand-blue border-brand-blue/30 text-[11px]">
                            Vanligast
                          </Badge>
                        )}
                      </div>
                      <p className="text-xl font-bold text-foreground mb-2">{tier.range}</p>
                      <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>
                      <ul className="space-y-1.5">
                        {tier.features.map((f) => (
                          <li
                            key={f}
                            className="flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-brand-blue shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ─── Project inquiry form ─────────────────────────── */}
              <Card className="border-border bg-card/80 backdrop-blur-sm max-w-2xl mx-auto">
                <CardContent className="p-6 sm:p-8">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Skicka en projektförfrågan
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Fyll i formuläret så återkommer vi med en offert. Alla fält markerade med * är
                    obligatoriska.
                  </p>

                  {formSubmitted ? (
                    /* ─── Success state ─── */
                    <div className="text-center py-8">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-teal/10 border border-brand-teal/20">
                        <CheckCircle className="text-brand-teal h-7 w-7" />
                      </div>
                      <h4 className="text-lg font-semibold text-foreground mb-2">
                        Förfrågan skickad!
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                        Ditt mailprogram har öppnats med din förfrågan. Om det inte fungerade, maila
                        oss direkt.
                      </p>
                      <a
                        href={`mailto:${MAILTO_RECIPIENTS}?subject=${encodeURIComponent("Projektförfrågan via SajtMaskin")}`}
                        className="text-brand-blue hover:text-brand-blue/80 text-sm font-medium inline-flex items-center gap-1"
                      >
                        <Mail className="h-4 w-4" />
                        {DISPLAY_EMAIL}
                      </a>
                      <div className="mt-6">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setFormSubmitted(false);
                            setFormStep(0);
                            setFormData({
                              name: "",
                              company: "",
                              email: "",
                              phone: "",
                              projectTypes: [],
                              currentUrl: "",
                              description: "",
                              budget: "",
                              timeline: "",
                              notes: "",
                            });
                          }}
                          className="text-sm"
                        >
                          Skicka en till
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Step indicators */}
                      <div className="flex items-center gap-2 mb-8">
                        {["Kontakt", "Projekt", "Budget"].map((label, i) => (
                          <button
                            key={label}
                            onClick={() => {
                              if (i < formStep) setFormStep(i);
                            }}
                            className="flex items-center gap-2 group"
                          >
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                                i === formStep
                                  ? "bg-brand-blue text-white"
                                  : i < formStep
                                    ? "bg-brand-teal/20 text-brand-teal"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {i < formStep ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            <span
                              className={`text-xs font-medium hidden sm:block ${
                                i === formStep
                                  ? "text-foreground"
                                  : i < formStep
                                    ? "text-brand-teal"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {label}
                            </span>
                            {i < 2 && (
                              <div
                                className={`w-8 h-px ${i < formStep ? "bg-brand-teal/40" : "bg-border"}`}
                              />
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Step 0: Contact */}
                      {formStep === 0 && (
                        <div className="space-y-4 animate-fadeIn">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                Namn *
                              </label>
                              <Input
                                placeholder="Ditt namn"
                                value={formData.name}
                                onChange={(e) => updateField("name", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                Företag
                              </label>
                              <Input
                                placeholder="Företagsnamn"
                                value={formData.company}
                                onChange={(e) => updateField("company", e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                E-post *
                              </label>
                              <Input
                                type="email"
                                placeholder="din@email.se"
                                value={formData.email}
                                onChange={(e) => updateField("email", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                Telefon
                              </label>
                              <Input
                                type="tel"
                                placeholder="070-123 45 67"
                                value={formData.phone}
                                onChange={(e) => updateField("phone", e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() => setFormStep(1)}
                              disabled={!canProceedStep0}
                              className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                            >
                              Nästa
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Step 1: Project */}
                      {formStep === 1 && (
                        <div className="space-y-4 animate-fadeIn">
                          <div>
                            <label className="text-sm font-medium text-foreground mb-2 block">
                              Typ av projekt
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {PROJECT_TYPES.map((type) => {
                                const Icon = type.icon;
                                const selected = formData.projectTypes.includes(type.id);
                                return (
                                  <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => toggleProjectType(type.id)}
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                                      selected
                                        ? "border-brand-blue/50 bg-brand-blue/10 text-brand-blue"
                                        : "border-border bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50"
                                    }`}
                                  >
                                    <Icon className="h-4 w-4" />
                                    {type.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">
                              Nuvarande webbplats (URL)
                            </label>
                            <Input
                              placeholder="https://example.com"
                              value={formData.currentUrl}
                              onChange={(e) => updateField("currentUrl", e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">
                              Beskriv ditt projekt *
                            </label>
                            <Textarea
                              placeholder="Berätta kortfattat vad du behöver – vad vill du uppnå med webbplatsen?"
                              rows={4}
                              value={formData.description}
                              onChange={(e) => updateField("description", e.target.value)}
                            />
                          </div>

                          <div className="flex justify-between pt-2">
                            <Button variant="outline" onClick={() => setFormStep(0)}>
                              <ArrowLeft className="h-4 w-4 mr-1" />
                              Tillbaka
                            </Button>
                            <Button
                              onClick={() => setFormStep(2)}
                              disabled={!canProceedStep1}
                              className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                            >
                              Nästa
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Budget & Timeline */}
                      {formStep === 2 && (
                        <div className="space-y-4 animate-fadeIn">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                Budgetram
                              </label>
                              <Select
                                value={formData.budget}
                                onValueChange={(v) => updateField("budget", v)}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Välj budget" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="5000-10000">
                                    Start: 5 000 – 10 000 kr
                                  </SelectItem>
                                  <SelectItem value="10000-20000">
                                    Plus: 10 000 – 20 000 kr
                                  </SelectItem>
                                  <SelectItem value="20000-40000">
                                    Pro: 20 000 – 40 000 kr
                                  </SelectItem>
                                  <SelectItem value="40000+">40 000+ kr</SelectItem>
                                  <SelectItem value="unsure">Vet ej / Flexibel</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-foreground mb-1.5 block">
                                Önskad tidplan
                              </label>
                              <Select
                                value={formData.timeline}
                                onValueChange={(v) => updateField("timeline", v)}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Välj tidplan" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="asap">Så snart som möjligt</SelectItem>
                                  <SelectItem value="1-2months">1-2 månader</SelectItem>
                                  <SelectItem value="3-6months">3-6 månader</SelectItem>
                                  <SelectItem value="flexible">Flexibelt</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium text-foreground mb-1.5 block">
                              Övrigt / kommentarer
                            </label>
                            <Textarea
                              placeholder="Något annat du vill berätta? Integrationer, speciella önskemål, etc."
                              rows={3}
                              value={formData.notes}
                              onChange={(e) => updateField("notes", e.target.value)}
                            />
                          </div>

                          <div className="flex justify-between pt-2">
                            <Button variant="outline" onClick={() => setFormStep(1)}>
                              <ArrowLeft className="h-4 w-4 mr-1" />
                              Tillbaka
                            </Button>
                            <Button
                              onClick={handleFormSubmit}
                              className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                            >
                              <Send className="h-4 w-4 mr-1.5" />
                              Skicka förfrågan
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══ CONTACT FOOTER ═══ */}
          <div className="mt-20 text-center">
            <div className="inline-flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 backdrop-blur-sm px-8 py-6">
              <div className="flex items-center gap-3">
                <Mail className="text-brand-blue h-5 w-5" />
                <span className="text-sm text-muted-foreground">Har du frågor? Kontakta oss:</span>
              </div>
              <a
                href={`mailto:${MAILTO_RECIPIENTS}?subject=${encodeURIComponent("Fråga via SajtMaskin")}`}
                className="text-lg font-semibold text-brand-blue hover:text-brand-blue/80 transition-colors inline-flex items-center gap-2"
              >
                <span>{DISPLAY_EMAIL}</span>
              </a>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  Vi svarar inom 24h
                </span>
                <span>•</span>
                <span>Säker betalning via Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode="register"
      />
    </div>
  );
}

// ─── Loading Fallback ─────────────────────────────────────────────
function BuyCreditsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Page Export ───────────────────────────────────────────────────
export default function BuyCreditsPage() {
  return (
    <Suspense fallback={<BuyCreditsLoading />}>
      <BuyCreditsContent />
    </Suspense>
  );
}
