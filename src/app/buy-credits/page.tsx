"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar, ShaderBackground } from "@/components/layout";
import { AuthModal } from "@/components/auth";
import { UserSettingsModal } from "@/components/settings/user-settings-modal";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import {
  Diamond,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Loader2,
  Star,
  Zap,
} from "lucide-react";

// Diamond packages
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check URL params for success/cancel
  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      setSuccessMessage(
        "Tack för ditt köp! Diamanterna har lagts till på ditt konto."
      );
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
        alert(data.error || "Kunde inte starta betalning. Kontrollera att du är inloggad och försök igen.");
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
    <div className="min-h-screen bg-black">
      {/* Shader Background - subtle amber for credits page */}
      <ShaderBackground color="#2a2000" speed={0.2} opacity={0.3} />

      <Navbar
        onLoginClick={() => setShowAuthModal(true)}
        onRegisterClick={() => setShowAuthModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)}
      />
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Main content with padding for navbar */}
      <main className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till start
          </Link>

          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border border-amber-500/30 mb-6">
              <Diamond className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Köp Diamanter
            </h1>
            <p className="text-gray-400 max-w-md mx-auto">
              Varje diamant ger dig en AI-generering eller förfining. Större
              paket = mer värde!
            </p>

            {/* Current balance */}
            {isAuthenticated && (
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-black/50 border border-gray-700">
                <Diamond className="h-4 w-4 text-amber-400" />
                <span className="text-sm text-gray-300">
                  Ditt saldo:{" "}
                  <span className="font-semibold text-amber-400">
                    {diamonds} diamanter
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-8 p-4 bg-teal-500/10 border border-teal-500/30 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-teal-400 flex-shrink-0" />
              <p className="text-teal-400">{successMessage}</p>
            </div>
          )}

          {/* Packages grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative border ${
                  pkg.popular
                    ? "border-teal-500/50 bg-teal-500/5"
                    : "border-gray-800 bg-black/50"
                } p-6 flex flex-col`}
              >
                {/* Popular badge */}
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-1 px-3 py-1 bg-teal-500 text-white text-xs font-medium">
                      <Star className="h-3 w-3 fill-current" />
                      Populär
                    </div>
                  </div>
                )}

                {/* Package name */}
                <h3 className="text-lg font-semibold text-white mb-2">
                  {pkg.name}
                </h3>

                {/* Diamond count */}
                <div className="flex items-center gap-2 mb-4">
                  <Diamond className="h-6 w-6 text-amber-400" />
                  <span className="text-3xl font-bold text-white">
                    {pkg.diamonds}
                  </span>
                  <span className="text-gray-500">diamanter</span>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-2xl font-bold text-white">
                    {pkg.price} kr
                  </span>
                  {pkg.savings > 0 && (
                    <span className="ml-2 text-sm text-teal-400">
                      Spara {pkg.savings}%
                    </span>
                  )}
                </div>

                {/* Price per diamond */}
                <p className="text-sm text-gray-500 mb-6">
                  {(pkg.price / pkg.diamonds).toFixed(1)} kr per diamant
                </p>

                {/* Features */}
                <ul className="space-y-2 mb-6 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-gray-400">
                    <Sparkles className="h-4 w-4 text-teal-400" />
                    {pkg.diamonds} AI-generationer
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-400">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Aldrig utgångsdatum
                  </li>
                </ul>

                {/* Buy button */}
                <Button
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={isLoading}
                  className={`w-full h-11 ${
                    pkg.popular
                      ? "bg-teal-600 hover:bg-teal-500"
                      : "bg-gray-800 hover:bg-gray-700"
                  } text-white font-medium`}
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
            <h2 className="text-xl font-semibold text-white mb-8">
              Vad ingår?
            </h2>
            <div className="grid sm:grid-cols-3 gap-8">
              <div>
                <div className="w-12 h-12 bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-teal-400" />
                </div>
                <h3 className="font-medium text-white mb-2">AI-generering</h3>
                <p className="text-sm text-gray-500">
                  Varje diamant = en komplett webbplats-generering
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-amber-400" />
                </div>
                <h3 className="font-medium text-white mb-2">Förfining</h3>
                <p className="text-sm text-gray-500">
                  Varje diamant = en förfining av din design
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-6 w-6 text-teal-400" />
                </div>
                <h3 className="font-medium text-white mb-2">
                  Ingen prenumeration
                </h3>
                <p className="text-sm text-gray-500">
                  Engångsköp, diamanterna gäller för alltid
                </p>
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
                className="text-teal-400 hover:text-teal-300"
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
    <div className="min-h-screen bg-black flex items-center justify-center">
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
