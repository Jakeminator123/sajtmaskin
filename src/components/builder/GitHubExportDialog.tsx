"use client";

import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AuthModal } from "@/components/auth/auth-modal";
import { ExternalLink, Github, Loader2 } from "lucide-react";

type GitHubExportDialogProps = {
  open: boolean;
  onClose: () => void;
  chatId: string | null;
  /** Version whose files should be exported (the active/selected version). */
  versionId: string | null;
  hasGitHub: boolean;
  isAuthenticated: boolean;
  /** Optional name used to pre-fill the repo field (project name or chat id). */
  suggestedRepoName?: string | null;
  githubUsername?: string | null;
};

/** GitHub repo names allow letters, digits, `.`, `-` and `_`. */
function sanitizeRepoName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
}

function buildDefaultRepoName(
  suggested: string | null | undefined,
  chatId: string | null,
): string {
  const base =
    suggested?.trim() ||
    (chatId ? `sajtmaskin-${chatId.slice(0, 8)}` : "sajtmaskin-sajt");
  return sanitizeRepoName(base) || "sajtmaskin-sajt";
}

export function GitHubExportDialog(props: GitHubExportDialogProps) {
  const { open, onClose } = props;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? <GitHubExportDialogForm {...props} /> : null}
    </Dialog>
  );
}

function GitHubExportDialogForm({
  onClose,
  chatId,
  versionId,
  hasGitHub,
  isAuthenticated,
  suggestedRepoName,
  githubUsername,
}: GitHubExportDialogProps) {
  const [repoName, setRepoName] = useState(() =>
    buildDefaultRepoName(suggestedRepoName, chatId),
  );
  const [makePrivate, setMakePrivate] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const privateId = useId();

  const oauthReturnTo =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/builder";
  const oauthHref = `/api/auth/github?returnTo=${encodeURIComponent(oauthReturnTo || "/builder")}`;

  const canExport = Boolean(chatId && versionId && repoName.trim() && !isExporting);

  const handleExport = async () => {
    if (!chatId || !versionId) return;
    const repo = repoName.trim();
    if (!repo) {
      setError("Ange ett namn på repot.");
      return;
    }
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/github/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, versionId, repo, private: makePrivate }),
      });
      const data = (await res.json().catch(() => null)) as
        | { repoUrl?: string; error?: string }
        | null;
      if (res.status === 401) {
        throw new Error("GitHub är inte kopplat. Koppla GitHub och försök igen.");
      }
      if (!res.ok) {
        throw new Error(data?.error || `Export misslyckades (HTTP ${res.status})`);
      }
      if (!data?.repoUrl) {
        throw new Error(
          "Exporten lyckades men inget repo returnerades. Försök igen om en stund.",
        );
      }
      setSuccessUrl(data.repoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte exportera till GitHub");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Exportera till GitHub</DialogTitle>
        <DialogDescription>
          Skapar ett nytt GitHub-repo med koden från den valda versionen.
        </DialogDescription>
      </DialogHeader>

      {!isAuthenticated ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Logga in eller skapa ett konto för att exportera koden till GitHub.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Stäng
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAuthMode("login");
                setShowAuthModal(true);
              }}
            >
              Logga in
            </Button>
            <Button
              onClick={() => {
                setAuthMode("register");
                setShowAuthModal(true);
              }}
            >
              Skapa gratis konto
            </Button>
          </div>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => {
              setShowAuthModal(false);
              onClose();
            }}
            defaultMode={authMode}
          />
        </div>
      ) : !hasGitHub ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            GitHub är inte kopplat ännu. Koppla ditt GitHub-konto för att kunna exportera koden.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Avbryt
            </Button>
            <Button asChild>
              <a href={oauthHref}>
                <Github className="mr-2 h-4 w-4" />
                Koppla GitHub
              </a>
            </Button>
          </div>
        </div>
      ) : successUrl ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            Koden exporterades till GitHub.
          </p>
          <a
            href={successUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal hover:text-brand-teal/80 inline-flex items-center gap-1 text-sm font-medium"
          >
            Öppna repo <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="flex justify-end">
            <Button onClick={onClose}>Klar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Repo-namn</Label>
            <Input
              value={repoName}
              onChange={(event) => {
                setRepoName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="mitt-projekt"
              disabled={isExporting}
            />
            <p className="text-muted-foreground text-xs">
              Ange bara ett namn, eller <code>owner/namn</code> för en organisation.
              {githubUsername ? ` Kopplat som @${githubUsername}.` : ""}
            </p>
          </div>
          <div className="border-border bg-muted/40 flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Switch
              id={privateId}
              checked={makePrivate}
              onCheckedChange={setMakePrivate}
              disabled={isExporting}
              className="mt-0.5"
            />
            <Label htmlFor={privateId} className="flex flex-col gap-1 font-normal">
              <span className="font-medium">Privat repo</span>
              <span className="text-muted-foreground text-xs">
                Av = publikt repo som vem som helst kan se.
              </span>
            </Label>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isExporting}>
              Avbryt
            </Button>
            <Button onClick={handleExport} disabled={!canExport}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Exportera"}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}
