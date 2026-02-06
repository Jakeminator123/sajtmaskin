"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar, ShaderBackground } from "@/components/layout";
import { AuthModal } from "@/components/auth";
import { useAuth } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Coins, ArrowLeft, CheckCircle, Wand2, Loader2, Star, Zap } from "lucide-react";

// Credit packages
const PACKAGES = [
  {
    id: "10_diamonds",
    name: "Starter",
    diamonds: 10,
    price: 49,
    popular: false,
    savings: 0,
  },
  {
    id: "25_diamonds",
    name: "Popular",
    diamonds: 25,
    price: 99,
    popular: true,
    savings: 20,
  },
  {
    id: "50_diamonds",
    name: "Pro",
    diamonds: 50,
    price: 179,
    popular: false,
    savings: 27,
  },
];

// Inner component that uses useSearchParams
function BuyCreditsContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated, diamonds, fetchUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check URL params for success/cancel
  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      setSuccessMessage("Tack för ditt köp! Credits har lagts till på ditt konto.");
      // Refresh user data to get updated balance
      fetchUser();
    }
  }, [searchParams, fetchUser]);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        alert(
          data.error ||
            "Kunde inte starta betalning. Kontrollera att du är inloggad och försök igen.",
        );
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Kunde inte starta betalningen");
    } finally {
      setIsLoading(false);
      setSelectedPackage(null);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Shader Background - warm accent for credits page */}
      <ShaderBackground theme="warm" speed={0.2} opacity={0.3} />

      <Navbar
        onLoginClick={() => setShowAuthModal(true)}
        onRegisterClick={() => setShowAuthModal(true)}
      />

      {/* Main content with padding for navbar */}
      <main className="relative z-10 px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          {/* Back link */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till start
          </Link>

          {/* Header */}
          <div className="mb-12 text-center">
            <div className="bg-brand-amber/10 border-brand-amber/30 mb-6 inline-flex h-16 w-16 items-center justify-center border">
              <Coins className="text-brand-amber h-8 w-8" />
            </div>
            <h1 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Köp Credits</h1>
            <p className="mx-auto max-w-md text-gray-400">
              Credits används per handling (oftast 1-3 per prompt beroende på modell). Större
              paket = mer värde!
            </p>

            {/* Current balance */}
            {isAuthenticated && (
              <div className="mt-6 inline-flex items-center gap-2 border border-gray-700 bg-black/50 px-4 py-2">
                <Coins className="text-brand-amber h-4 w-4" />
                <span className="text-sm text-gray-300">
                  Ditt saldo:{" "}
                  <span className="text-brand-amber font-semibold">{diamonds} credits</span>
                </span>
              </div>
            )}
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="bg-brand-teal/10 border-brand-teal/30 mb-8 flex items-center gap-3 border p-4">
              <CheckCircle className="text-brand-teal h-5 w-5 shrink-0" />
              <p className="text-brand-teal">{successMessage}</p>
            </div>
          )}

          {/* Packages grid */}
          <div className="grid gap-6 md:grid-cols-3">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative border ${
                  pkg.popular
                    ? "border-brand-teal/50 bg-brand-teal/5"
                    : "border-gray-800 bg-black/50"
                } flex flex-col p-6`}
              >
                {/* Popular badge */}
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="bg-brand-teal flex items-center gap-1 px-3 py-1 text-xs font-medium text-white">
                      <Star className="h-3 w-3 fill-current" />
                      Populär
                    </div>
                  </div>
                )}

                {/* Package name */}
                <h3 className="mb-2 text-lg font-semibold text-white">{pkg.name}</h3>

                {/* Credit count */}
                <div className="mb-4 flex items-center gap-2">
                  <Coins className="text-brand-amber h-6 w-6" />
                  <span className="text-3xl font-bold text-white">{pkg.diamonds}</span>
                  <span className="text-gray-500">credits</span>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-2xl font-bold text-white">{pkg.price} kr</span>
                  {pkg.savings > 0 && (
                    <span className="text-brand-teal ml-2 text-sm">Spara {pkg.savings}%</span>
                  )}
                </div>

                {/* Price per credit */}
                <p className="mb-6 text-sm text-gray-500">
                  {(pkg.price / pkg.diamonds).toFixed(1)} kr per credit
                </p>

                {/* Features */}
                <ul className="mb-6 grow space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-400">
                    <Wand2 className="text-brand-teal h-4 w-4" />
                    {pkg.diamonds} credits att använda
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-400">
                    <Zap className="text-brand-amber h-4 w-4" />
                    Aldrig utgångsdatum
                  </li>
                </ul>

                {/* Buy button */}
                <Button
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={isLoading}
                  className={`h-11 w-full ${
                    pkg.popular
                      ? "bg-brand-teal hover:bg-brand-teal/90"
                      : "bg-gray-800 hover:bg-gray-700"
                  } font-medium text-white`}
                >
                  {isLoading && selectedPackage === pkg.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>{isAuthenticated ? "Köp nu" : "Logga in & köp"}</>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* Features section */}
          <div className="mt-16 text-center">
            <h2 className="mb-8 text-xl font-semibold text-white">Vad ingår?</h2>
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <div className="bg-brand-teal/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                  <Wand2 className="text-brand-teal h-6 w-6" />
                </div>
                <h3 className="mb-2 font-medium text-white">AI-generering</h3>
                <p className="text-sm text-gray-500">
                  Generering kostar 1-3 credits beroende på modell
                </p>
              </div>
              <div>
                <div className="bg-brand-amber/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                  <Zap className="text-brand-amber h-6 w-6" />
                </div>
                <h3 className="mb-2 font-medium text-white">Förfining</h3>
                <p className="text-sm text-gray-500">Förfining kostar 1-2 credits beroende på modell</p>
              </div>
              <div>
                <div className="bg-brand-teal/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                  <CheckCircle className="text-brand-teal h-6 w-6" />
                </div>
                <h3 className="mb-2 font-medium text-white">Ingen prenumeration</h3>
                <p className="text-sm text-gray-500">Engångsköp, credits gäller för alltid</p>
              </div>
            </div>
          </div>

          {/* Payment info */}
          <div className="mt-16 text-center text-sm text-gray-500">
            <p>Säker betalning via Stripe. Vi accepterar kort.</p>
            <p className="mt-2">
              Har du frågor?{" "}
              <a
                href="mailto:support@sajtmaskin.se"
                className="text-brand-teal hover:text-brand-teal/80"
              >
                Kontakta oss
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode="register"
      />
    </div>
  );
}

// Loading fallback
function BuyCreditsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
    </div>
  );
}

// Main page component with Suspense boundary
export default function BuyCreditsPage() {
  return (
    <Suspense fallback={<BuyCreditsLoading />}>
      <BuyCreditsContent />
    </Suspense>
  );
}
