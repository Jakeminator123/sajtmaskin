"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { ShaderBackground } from "@/components/layout/shader-background";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Github,
  Loader2,
  PencilLine,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";
import { canRepublish, isTerminalDeploymentStatus } from "@/lib/projects/can-republish";
import {
  getProject,
  getProjectSite,
  type Project,
  type ProjectSite,
  type SitePublishState,
} from "@/lib/projects/project-client";
import {
  addressKindHelp,
  addressKindLabel,
  publishStateLabel,
  type SiteStateTone,
} from "@/lib/projects/site-labels";
import { useAuth } from "@/lib/auth/auth-store";
import { GitHubExportDialog } from "@/components/builder/project-transfer/GitHubExportDialog";
import { ByodDomainFlow } from "@/components/projects/ByodDomainFlow";

const TONE_CLASS: Record<SiteStateTone, string> = {
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  problem: "bg-red-500/10 text-red-400 border-red-500/30",
  idle: "bg-gray-800 text-gray-400 border-gray-700",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-gray-800 bg-black/50 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ProjectSitePage() {
  const { user, isAuthenticated, hasGitHub } = useAuth();
  const params = useParams<{ id: string }>();
  const projectId = typeof params?.id === "string" ? params.id : "";

  const [project, setProject] = useState<Project | null>(null);
  const [site, setSite] = useState<ProjectSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [republishing, setRepublishing] = useState(false);
  const [githubExportOpen, setGithubExportOpen] = useState(false);
  const [watchedDeploymentId, setWatchedDeploymentId] = useState<string | null>(null);
  const reloadedForRef = useRef<string | null>(null);
  const deploymentWatch = useDeploymentStatus(watchedDeploymentId);
  const watchingInFlight =
    watchedDeploymentId !== null && !isTerminalDeploymentStatus(deploymentWatch.status);

  const load = useCallback(async () => {
    if (!projectId) return;
    setNotFound(false);
    setError(null);
    try {
      setLoading(true);
      const [projectResult, siteResult] = await Promise.all([
        getProject(projectId),
        getProjectSite(projectId),
      ]);
      if (!siteResult) {
        setNotFound(true);
        setProject(null);
        setSite(null);
        setWatchedDeploymentId(null);
        return;
      }
      setProject(projectResult.project);
      setSite(siteResult);
      // Keep watching a completed id when the overview still reports it as
      // in-flight (webhook lag). The terminal-effect ref stops load() loops;
      // dropping the watch here would fall back to a stale "Bygger" badge.
      setWatchedDeploymentId(siteResult.latestDeploymentId);
    } catch (err: unknown) {
      // A 404 from the project endpoint surfaces as a thrown error; treat the
      // "not yours / missing" case the same way the site endpoint does rather
      // than showing a raw failure for a project the user simply cannot see.
      const message = err instanceof Error ? err.message : "Kunde inte läsa projektet";
      setProject(null);
      setSite(null);
      setWatchedDeploymentId(null);
      if (/not found/i.test(message)) {
        setNotFound(true);
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reloadedForRef.current = null;
    setWatchedDeploymentId(null);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!watchedDeploymentId) return;
    if (!isTerminalDeploymentStatus(deploymentWatch.status)) return;
    if (reloadedForRef.current === watchedDeploymentId) return;
    reloadedForRef.current = watchedDeploymentId;
    void load();
  }, [deploymentWatch.status, watchedDeploymentId, load]);

  async function copyAddress() {
    if (!site?.address.liveUrl) return;
    try {
      await navigator.clipboard.writeText(site.address.liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kunde inte kopiera adressen.");
    }
  }

  const publishState: SitePublishState | null = site
    ? watchedDeploymentId
      ? deploymentWatch.status
      : site.state
    : null;
  const republishAllowed = canRepublish(publishState, {
    republishing,
    watching: watchingInFlight,
  });

  /**
   * Re-publish the version that is already live, through the same deploy route
   * the builder uses — so credits, release gate and every other check apply
   * unchanged. The server's message is surfaced verbatim because a blocked
   * publish is a real answer, not an error to translate.
   */
  async function republish() {
    if (!site?.chatId || !site.liveVersionId) return;
    if (!canRepublish(publishState, { republishing, watching: watchingInFlight })) return;
    setRepublishing(true);
    try {
      const response = await fetch("/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: site.chatId,
          versionId: site.liveVersionId,
          target: "production",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success === false) {
        toast.error(data?.error || "Publiceringen kunde inte startas.");
        return;
      }
      const deploymentId = typeof data?.id === "string" && data.id.trim() ? data.id : null;
      toast.success("Publiceringen startade.");
      if (deploymentId) {
        reloadedForRef.current = null;
        setWatchedDeploymentId(deploymentId);
        return;
      }
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Publiceringen kunde inte startas.");
    } finally {
      setRepublishing(false);
    }
  }

  const stateLabel = publishState ? publishStateLabel(publishState) : null;

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="default" speed={0.2} opacity={0.3} />
      <Navbar />

      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-12">
        <Link
          href="/projects"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Mina projekt
        </Link>

        {loading && (
          <div className="space-y-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && notFound && (
          <div className="border border-gray-800 bg-black/50 p-8 text-center">
            <h1 className="text-xl font-semibold text-gray-300">Projektet hittades inte</h1>
            <p className="mt-2 text-gray-500">Det finns inte, eller tillhör ett annat konto.</p>
            <Link href="/projects" className="mt-6 inline-block">
              <Button variant="outline">Till mina projekt</Button>
            </Link>
          </div>
        )}

        {!loading && !notFound && error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
            <Button variant="outline" size="sm" className="ml-4" onClick={() => void load()}>
              Försök igen
            </Button>
          </div>
        )}

        {!loading && !notFound && site && (
          <>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white">{project?.name ?? "Din sajt"}</h1>
                {stateLabel && (
                  <span
                    className={`mt-2 inline-block border px-2 py-0.5 text-xs ${TONE_CLASS[stateLabel.tone]}`}
                  >
                    {stateLabel.label}
                  </span>
                )}
              </div>
              <Link href={`/builder?project=${site.projectId}`}>
                <Button className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
                  <PencilLine className="h-4 w-4" />
                  Redigera sajten
                </Button>
              </Link>
            </div>

            <div className="space-y-6">
              <Section title="Adress" description={addressKindLabel(site.address.kind)}>
                {site.address.liveUrl ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="border border-gray-800 bg-gray-900/60 px-3 py-2 text-sm break-all text-white">
                        {site.address.liveUrl}
                      </code>
                      <Button variant="outline" size="sm" className="gap-2" onClick={copyAddress}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Kopierad" : "Kopiera"}
                      </Button>
                      <a href={site.address.liveUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-2">
                          <ExternalLink className="h-4 w-4" />
                          Öppna
                        </Button>
                      </a>
                    </div>
                    {addressKindHelp(site.address.kind) && (
                      <p className="text-sm text-gray-500">{addressKindHelp(site.address.kind)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">{addressKindHelp("none")}</p>
                )}
              </Section>

              <Section title="Publicering">
                <div className="space-y-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500">Senast publicerad</dt>
                      <dd className="text-gray-300">
                        {site.liveAt
                          ? new Date(site.liveAt).toLocaleString("sv-SE", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Aldrig"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Publicerad version</dt>
                      <dd className="text-gray-300">
                        {site.liveVersionId ? (
                          <code className="text-xs">{site.liveVersionId.slice(0, 8)}</code>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  {site.liveVersionId && site.chatId ? (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => void republish()}
                        disabled={!republishAllowed}
                      >
                        {republishing || watchingInFlight ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Publicera om
                      </Button>
                      <p className="text-xs text-gray-600">
                        Publicerar samma version igen. Kostar credits precis som en publicering från
                        byggaren.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Link href={`/builder?project=${site.projectId}`}>
                        <Button variant="outline" className="gap-2">
                          <Upload className="h-4 w-4" />
                          Publicera i byggaren
                        </Button>
                      </Link>
                      <p className="text-xs text-gray-600">
                        Den första publiceringen görs i byggaren, där du väljer namn och
                        SEO-inställningar.
                      </p>
                    </div>
                  )}
                </div>
              </Section>

              <Section
                title="Egen domän"
                description="Koppla en domän du redan äger. Ingen tillgänglighetskontroll eller köp."
              >
                <div className="space-y-3">
                  {site.customDomain ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-gray-500" />
                      <code className="text-white">{site.customDomain}</code>
                      <span
                        className={`border px-2 py-0.5 text-xs ${
                          site.customDomainVerified ? TONE_CLASS.live : TONE_CLASS.progress
                        }`}
                      >
                        {site.customDomainVerified ? "Live" : "Väntar på DNS"}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Ingen egen domän kopplad.</p>
                  )}
                  <ByodDomainFlow
                    projectId={site.projectId}
                    chatId={site.chatId}
                    publishedSlug={site.publishedSlug}
                    initialDomain={site.customDomain}
                    onChanged={() => void load()}
                  />
                </div>
              </Section>

              <Section
                title="Kod och utflytt"
                description="Du kan exportera sajten även när publiceringen eller betalningen är pausad."
              >
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setGithubExportOpen(true)}
                    disabled={!site.chatId || !site.liveVersionId}
                  >
                    <Github className="h-4 w-4" />
                    Exportera till GitHub
                  </Button>
                  <p className="text-xs text-gray-600">
                    Exporten innehåller den publicerade versionens kod, uppladdade projektmedia som
                    filer och en flyttguide. Databasdata, domänregistrering, tredjepartskonton,
                    hemliga nyckelvärden och licenser följer inte med.
                  </p>
                  {(!site.chatId || !site.liveVersionId) && (
                    <p className="text-xs text-amber-500">
                      Publicera en version först så att det finns en bestämd version att exportera.
                    </p>
                  )}
                </div>
              </Section>
            </div>
            <GitHubExportDialog
              open={githubExportOpen}
              onClose={() => setGithubExportOpen(false)}
              chatId={site.chatId}
              versionId={site.liveVersionId}
              hasGitHub={hasGitHub}
              isAuthenticated={isAuthenticated}
              suggestedRepoName={project?.name ?? null}
              githubUsername={user?.github_username ?? null}
              projectId={site.projectId}
              suggestedSiteUrl={site.customDomain ? `https://${site.customDomain}` : null}
            />
          </>
        )}
      </div>
    </div>
  );
}
