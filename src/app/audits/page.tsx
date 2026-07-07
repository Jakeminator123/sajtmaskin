"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { ShaderBackground } from "@/components/layout/shader-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { AuditModal } from "@/components/modals/audit-modal";
import { useAuth } from "@/lib/auth/auth-store";
import {
  deleteSavedAudit,
  getSavedAudit,
  getSavedAudits,
  type SavedAuditListItem,
} from "@/lib/audits-client";
import type { AuditResult } from "@/types/audit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

function AuditsPageInner() {
  const { isAuthenticated, isInitialized } = useAuth();
  const [audits, setAudits] = useState<SavedAuditListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [openResult, setOpenResult] = useState<AuditResult | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: number | null;
    label: string;
  }>({ isOpen: false, id: null, label: "" });
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAudits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getSavedAudits();
      setAudits(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Kunde inte ladda audits";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    loadAudits();
  }, [isInitialized, isAuthenticated, loadAudits]);

  async function handleOpen(id: number) {
    setOpeningId(id);
    try {
      const detail = await getSavedAudit(id);
      if (!detail.result) {
        toast.error("Audit-resultatet kunde inte läsas.");
        return;
      }
      setOpenResult(detail.result);
      setOpenUrl(detail.url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunde inte öppna audit.");
    } finally {
      setOpeningId(null);
    }
  }

  function openDeleteDialog(id: number, label: string) {
    setDeleteDialog({ isOpen: true, id, label });
  }

  function closeDeleteDialog() {
    setDeleteDialog({ isOpen: false, id: null, label: "" });
  }

  async function confirmDelete() {
    const { id } = deleteDialog;
    if (id === null) return;

    setIsDeleting(true);
    const previous = [...audits];
    setAudits((prev) => prev.filter((a) => a.id !== id));
    closeDeleteDialog();

    try {
      await deleteSavedAudit(id);
      toast.success("Audit borttagen.");
    } catch (err: unknown) {
      setAudits(previous);
      toast.error(err instanceof Error ? err.message : "Kunde inte ta bort audit.");
    } finally {
      setIsDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Okänt datum";
    return date.toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="default" speed={0.2} opacity={0.3} />

      <Navbar
        onLoginClick={() => {
          setAuthMode("login");
          setShowAuthModal(true);
        }}
        onRegisterClick={() => {
          setAuthMode("register");
          setShowAuthModal(true);
        }}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-12">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Mina audits</h1>
            <p className="mt-1 text-gray-400">
              {isAuthenticated ? `${audits.length} sparade audits` : "Sparade webbplatsanalyser"}
            </p>
          </div>
          <Link href="/projects">
            <Button variant="outline" className="gap-2">
              Mina projekt
            </Button>
          </Link>
        </div>

        {/* Not logged in */}
        {isInitialized && !isAuthenticated && (
          <div className="py-20 text-center">
            <Search className="mx-auto mb-4 h-16 w-16 text-gray-600" />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">Logga in för att se dina audits</h2>
            <p className="mb-6 text-gray-500">
              Sparade webbplatsanalyser kopplas till ditt konto.
            </p>
            <Button
              className="bg-brand-teal hover:bg-brand-teal/90"
              onClick={() => {
                setAuthMode("login");
                setShowAuthModal(true);
              }}
            >
              Logga in
            </Button>
          </div>
        )}

        {/* Loading */}
        {isAuthenticated && loading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden border border-gray-800 bg-black/50">
                <div className="space-y-3 p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isAuthenticated && error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
        )}

        {/* Empty */}
        {isAuthenticated && !loading && !error && audits.length === 0 && (
          <div className="py-20 text-center">
            <Search className="mx-auto mb-4 h-16 w-16 text-gray-600" />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">Inga sparade audits än</h2>
            <p className="mb-6 text-gray-500">
              Kör en webbplatsanalys på startsidan och tryck &quot;Spara&quot; i resultatet.
            </p>
            <Link href="/">
              <Button className="bg-brand-teal hover:bg-brand-teal/90">Analysera en sajt</Button>
            </Link>
          </div>
        )}

        {/* Grid */}
        {isAuthenticated && !loading && audits.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="group flex flex-col justify-between overflow-hidden border border-gray-800 bg-black/50 p-4 transition-all hover:border-gray-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-1 font-semibold text-white">
                        {audit.company_name || audit.domain}
                      </h3>
                      <p className="line-clamp-1 text-xs text-gray-500">{audit.domain}</p>
                    </div>
                    {typeof audit.score_overall === "number" && (
                      <span className="shrink-0 bg-gray-800 px-2 py-0.5 text-xs font-semibold text-brand-teal">
                        {audit.score_overall}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs text-gray-600">
                    <Clock className="h-3 w-3" />
                    {formatDate(audit.created_at)}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-brand-teal hover:bg-brand-teal/90 gap-2"
                    onClick={() => handleOpen(audit.id)}
                    disabled={openingId === audit.id}
                  >
                    {openingId === audit.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Öppna
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      openDeleteDialog(audit.id, audit.company_name || audit.domain);
                    }}
                    aria-label={`Ta bort audit för ${audit.company_name || audit.domain}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reuse the existing audit modal (no build-overlay: onBuildFromAudit omitted) */}
      <AuditModal
        result={openResult}
        auditedUrl={openUrl}
        isOpen={openResult !== null}
        onClose={() => {
          setOpenResult(null);
          setOpenUrl(null);
        }}
      />

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort audit?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort den sparade auditen för &quot;{deleteDialog.label}
              &quot;? Denna åtgärd kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AuditsPageFallback() {
  return (
    <div className="bg-background min-h-screen">
      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-28" />
      </div>
    </div>
  );
}

export default function AuditsPage() {
  return (
    <Suspense fallback={<AuditsPageFallback />}>
      <AuditsPageInner />
    </Suspense>
  );
}
