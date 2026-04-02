"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout";
import { MinimalFooter } from "@/components/layout/minimal-footer";
import { AuthModal } from "@/components/auth";
import { useAuth } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  CheckCircle,
  Loader2,
  Star,
  Building2,
  Send,
  Sparkles,
  Globe,
  ShoppingCart,
  Palette,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const PACKAGES = [
  { id: "10_credits", name: "Starter", diamonds: 10, price: 49, popular: false, savings: 0 },
  { id: "25_credits", name: "Popular", diamonds: 25, price: 99, popular: true, savings: 19 },
  { id: "50_credits", name: "Pro", diamonds: 50, price: 179, popular: false, savings: 27 },
];

const STUDIO_TIERS = [
  { name: "Start", range: "5 000 – 10 000 kr", features: ["1-5 sidor", "Kontaktformulär", "Grundläggande SEO"] },
  { name: "Plus", range: "10 000 – 20 000 kr", features: ["5-10 sidor", "Blogg/nyheter", "Utökad SEO"] },
  { name: "Pro", range: "20 000 – 40 000+ kr", features: ["E-handel", "API-integrationer", "Specialutveckling"] },
];

const PROJECT_TYPES = [
  { id: "new", label: "Ny webbplats", icon: Globe },
  { id: "redesign", label: "Redesign", icon: Palette },
  { id: "landing", label: "Landningssida", icon: Sparkles },
  { id: "ecommerce", label: "E-handel", icon: ShoppingCart },
  { id: "other", label: "Annat", icon: Building2 },
];

const MAILTO_RECIPIENTS = "ch.genberg@gmail.com,erik@sajtstudio.se";

function buildMailtoLink(data: {
  name: string; company: string; email: string; phone: string;
  projectTypes: string[]; currentUrl: string; description: string;
  budget: string; timeline: string; notes: string;
}): string {
  const subject = encodeURIComponent(`Projektförfrågan – ${data.company || data.name}`);
  const lines = [
    "Hej!", "", `Namn: ${data.name}`, `Företag: ${data.company || "–"}`,
    `E-post: ${data.email}`, `Telefon: ${data.phone || "–"}`, "",
    `Typ: ${data.projectTypes.join(", ") || "–"}`, `Webb: ${data.currentUrl || "–"}`,
    `Beskrivning: ${data.description || "–"}`, "",
    `Budget: ${data.budget || "–"}`, `Tidplan: ${data.timeline || "–"}`,
    `Övrigt: ${data.notes || "–"}`,
  ];
  return `mailto:${MAILTO_RECIPIENTS}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function BuyCreditsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, diamonds, fetchUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState({
    name: "", company: "", email: "", phone: "",
    projectTypes: [] as string[], currentUrl: "", description: "",
    budget: "", timeline: "", notes: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");
    if (success === "true" && sessionId) {
      setSuccessMessage("Köp genomfört! Credits tillagda.");
      fetchUser();
    }

    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    const verified = searchParams.get("verified");
    const reason = searchParams.get("reason");
    if (!login && !authError && !verified) return;

    if (login === "success") toast.success("Inloggningen lyckades.");
    if (authError) { toast.error(authError); setAuthMode("login"); setShowAuthModal(true); }
    if (verified === "success") {
      toast.success("E-post verifierad. Logga in för att fortsätta.");
      setAuthMode("login"); setShowAuthModal(true);
    } else if (verified === "error") {
      const msg = reason === "missing_token" ? "Token saknas."
        : reason === "invalid_or_expired" ? "Länken är ogiltig."
        : "Verifiering misslyckades.";
      toast.error(msg); setAuthMode("login"); setShowAuthModal(true);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    ["login", "error", "verified", "reason"].forEach((k) => nextParams.delete(k));
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [fetchUser, pathname, router, searchParams]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handlePurchase = async (packageId: string) => {
    if (!isAuthenticated) { setAuthMode("login"); setShowAuthModal(true); return; }
    setSelectedPackage(packageId);
    setIsLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await response.json();
      if (data.success && data.url) window.location.href = data.url;
      else toast.error(data.error || "Kunde inte starta betalning.");
    } catch { toast.error("Kunde inte starta betalningen."); }
    finally { setIsLoading(false); setSelectedPackage(null); }
  };

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
    window.open(buildMailtoLink(formData), "_blank");
    setFormSubmitted(true);
  };

  const canProceedStep0 = formData.name.trim() && formData.email.trim();
  const canProceedStep1 = formData.description.trim();

  return (
    <div className="bg-background min-h-screen">
      <Navbar
        onLoginClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
        onRegisterClick={() => { setAuthMode("register"); setShowAuthModal(true); }}
      />

      <main className="px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Tillbaka
          </Link>

          <div className="mb-8">
            <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">Priser</h1>
            <p className="text-sm text-muted-foreground">
              Credits för AI-generering eller professionell hjälp via SajtStudio.
            </p>
            {isAuthenticated && (
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5 text-primary" />
                {diamonds} credits
              </span>
            )}
          </div>

          {successMessage && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-primary">{successMessage}</p>
            </div>
          )}

          <Tabs defaultValue="credits" className="w-full gap-0">
            <div className="mb-8 flex justify-center">
              <TabsList className="inline-flex rounded-lg border border-border bg-muted/50 p-1 gap-1">
                <TabsTrigger value="credits" className="rounded-md px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Credits
                </TabsTrigger>
                <TabsTrigger value="studio" className="rounded-md px-4 py-2 text-sm data-[state=active]:bg-foreground data-[state=active]:text-background">
                  SajtStudio
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Credits tab */}
            <TabsContent value="credits">
              <div className="grid gap-4 sm:grid-cols-3">
                {PACKAGES.map((pkg) => (
                  <Card key={pkg.id} className={`relative transition-all ${pkg.popular ? "border-primary/40 shadow-sm" : "border-border"}`}>
                    <CardContent className="flex flex-col p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground">{pkg.name}</h3>
                        {pkg.popular && (
                          <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Star className="h-2.5 w-2.5 fill-current" /> Populär
                          </span>
                        )}
                      </div>
                      <div className="mb-1">
                        <span className="text-3xl font-bold text-foreground">{pkg.diamonds}</span>
                        <span className="ml-1 text-xs text-muted-foreground">credits</span>
                      </div>
                      <p className="mb-4 text-lg font-semibold text-foreground">
                        {pkg.price} kr
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({(pkg.price / pkg.diamonds).toFixed(1)} kr/st)
                        </span>
                      </p>
                      <Button
                        onClick={() => handlePurchase(pkg.id)}
                        disabled={isLoading}
                        variant={pkg.popular ? "default" : "outline"}
                        className="mt-auto"
                      >
                        {isLoading && selectedPackage === pkg.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isAuthenticated ? "Köp" : "Logga in & köp"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Collapsible cost breakdown */}
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => setShowCostBreakdown((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Vad kostar varje åtgärd?
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showCostBreakdown ? "rotate-180" : ""}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${showCostBreakdown ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="grid gap-1.5 sm:grid-cols-2 max-w-xl">
                    {[
                      ["Generering (Mini)", "5"], ["Generering (Pro)", "7"], ["Generering (Max)", "10"],
                      ["Förfining (Mini)", "3"], ["Förfining (Pro)", "4"], ["Förfining (Max)", "6"],
                      ["Wizard-läge", "11"], ["Audit", "15–25"], ["Publicering", "20"], ["Hosting/mån", "10"],
                    ].map(([label, cost]) => (
                      <div key={label} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">{cost} credits</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Säker betalning via Stripe. Engångsköp — inga prenumerationer.
              </p>
            </TabsContent>

            {/* SajtStudio tab */}
            <TabsContent value="studio">
              <p className="mb-6 text-center text-sm text-muted-foreground">
                Professionell webbhjälp från SajtStudio — från enkla sajter till e-handel.
              </p>

              <div className="grid gap-3 sm:grid-cols-3 mb-10">
                {STUDIO_TIERS.map((tier) => (
                  <Card key={tier.name} className="border-border">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-foreground mb-0.5">{tier.name}</h3>
                      <p className="text-sm font-semibold text-foreground mb-2">{tier.range}</p>
                      <ul className="space-y-1">
                        {tier.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Stepper form */}
              <Card className="border-border max-w-xl mx-auto">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-foreground mb-1">Projektförfrågan</h3>
                  <p className="text-xs text-muted-foreground mb-5">Fyll i så återkommer vi med offert.</p>

                  {formSubmitted ? (
                    <div className="py-6 text-center">
                      <CheckCircle className="mx-auto mb-2 h-8 w-8 text-primary" />
                      <p className="text-sm text-foreground mb-1">Skickat!</p>
                      <p className="text-xs text-muted-foreground mb-4">Ditt mailprogram har öppnats.</p>
                      <Button variant="outline" size="sm" onClick={() => { setFormSubmitted(false); setFormStep(0); setFormData({ name: "", company: "", email: "", phone: "", projectTypes: [], currentUrl: "", description: "", budget: "", timeline: "", notes: "" }); }}>
                        Ny förfrågan
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-6">
                        {["Kontakt", "Projekt", "Budget"].map((label, i) => (
                          <button key={label} onClick={() => { if (i < formStep) setFormStep(i); }} className="flex items-center gap-1.5">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${i === formStep ? "bg-primary text-primary-foreground" : i < formStep ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {i < formStep ? <CheckCircle className="h-3 w-3" /> : i + 1}
                            </div>
                            <span className={`text-xs hidden sm:block ${i === formStep ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                            {i < 2 && <div className={`w-6 h-px ${i < formStep ? "bg-primary/30" : "bg-border"}`} />}
                          </button>
                        ))}
                      </div>

                      {formStep === 0 && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input placeholder="Namn *" value={formData.name} onChange={(e) => updateField("name", e.target.value)} />
                            <Input placeholder="Företag" value={formData.company} onChange={(e) => updateField("company", e.target.value)} />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input type="email" placeholder="E-post *" value={formData.email} onChange={(e) => updateField("email", e.target.value)} />
                            <Input type="tel" placeholder="Telefon" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} />
                          </div>
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => setFormStep(1)} disabled={!canProceedStep0}>Nästa <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                          </div>
                        </div>
                      )}

                      {formStep === 1 && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-1.5">
                            {PROJECT_TYPES.map((t) => {
                              const Icon = t.icon;
                              const sel = formData.projectTypes.includes(t.id);
                              return (
                                <button key={t.id} type="button" onClick={() => toggleProjectType(t.id)} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${sel ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                                  <Icon className="h-3.5 w-3.5" />{t.label}
                                </button>
                              );
                            })}
                          </div>
                          <Input placeholder="Nuvarande webbplats (URL)" value={formData.currentUrl} onChange={(e) => updateField("currentUrl", e.target.value)} />
                          <Textarea placeholder="Beskriv ditt projekt *" rows={3} value={formData.description} onChange={(e) => updateField("description", e.target.value)} />
                          <div className="flex justify-between">
                            <Button variant="outline" size="sm" onClick={() => setFormStep(0)}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Tillbaka</Button>
                            <Button size="sm" onClick={() => setFormStep(2)} disabled={!canProceedStep1}>Nästa <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                          </div>
                        </div>
                      )}

                      {formStep === 2 && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Select value={formData.budget} onValueChange={(v) => updateField("budget", v)}>
                              <SelectTrigger><SelectValue placeholder="Budget" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5000-10000">5 000 – 10 000 kr</SelectItem>
                                <SelectItem value="10000-20000">10 000 – 20 000 kr</SelectItem>
                                <SelectItem value="20000-40000">20 000 – 40 000 kr</SelectItem>
                                <SelectItem value="40000+">40 000+ kr</SelectItem>
                                <SelectItem value="unsure">Flexibel</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={formData.timeline} onValueChange={(v) => updateField("timeline", v)}>
                              <SelectTrigger><SelectValue placeholder="Tidplan" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="asap">Så snart som möjligt</SelectItem>
                                <SelectItem value="1-2months">1-2 månader</SelectItem>
                                <SelectItem value="3-6months">3-6 månader</SelectItem>
                                <SelectItem value="flexible">Flexibelt</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea placeholder="Övrigt" rows={2} value={formData.notes} onChange={(e) => updateField("notes", e.target.value)} />
                          <div className="flex justify-between">
                            <Button variant="outline" size="sm" onClick={() => setFormStep(1)}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Tillbaka</Button>
                            <Button size="sm" onClick={handleFormSubmit}><Send className="h-3.5 w-3.5 mr-1" />Skicka</Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <MinimalFooter />

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} defaultMode={authMode} />
    </div>
  );
}

function BuyCreditsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function BuyCreditsPage() {
  return (
    <Suspense fallback={<BuyCreditsLoading />}>
      <BuyCreditsContent />
    </Suspense>
  );
}
