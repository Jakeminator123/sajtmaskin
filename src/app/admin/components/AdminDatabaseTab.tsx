"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DatabaseStats } from "./types";

interface AdminDatabaseTabProps {
  dbStats: DatabaseStats | null;
  actionLoading: string | null;
  confirmAction: string | null;
  onClearTable: (table: string) => void | Promise<void>;
  onFlushRedis: () => void | Promise<void>;
  onResetAll: () => void | Promise<void>;
  onClearUploads: () => void | Promise<void>;
  setActionLoading: Dispatch<SetStateAction<string | null>>;
  setConfirmAction: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  refreshDbStats: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

export function AdminDatabaseTab({
  dbStats,
  actionLoading,
  confirmAction,
  onClearTable,
  onFlushRedis,
  onResetAll,
  onClearUploads,
  setActionLoading,
  setConfirmAction,
  setMessage,
  refreshDbStats,
  refreshStats,
}: AdminDatabaseTabProps) {
  const showMessage = (text: string, durationMs = 5000) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), durationMs);
  };

  return (
    <div className="space-y-6">
      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
              <HardDrive className="text-brand-teal h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Supabase Database</h2>
              <p className="text-sm text-gray-500">Storlek: {dbStats?.dbFileSize || "..."}</p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {dbStats?.database && (
            <>
              <DbStatCard label="Användare" value={dbStats.database.users} />
              <DbStatCard label="Projekt" value={dbStats.database.projects} />
              <DbStatCard label="Sidvisningar" value={dbStats.database.pageViews} />
              <DbStatCard label="Transaktioner" value={dbStats.database.transactions} />
              <DbStatCard label="Gäst-användning" value={dbStats.database.guestUsage} />
              <DbStatCard label="Företagsprofiler" value={dbStats.database.companyProfiles} />
            </>
          )}
        </div>

        <div className="border-t border-gray-800 pt-4">
          <h3 className="mb-3 text-sm font-medium text-gray-400">Rensa tabeller</h3>
          <div className="flex flex-wrap gap-2">
            {[
              "page_views",
              "guest_usage",
              "transactions",
              "projects",
              "company_profiles",
              "users",
            ].map((table) => (
              <Button
                key={table}
                variant="outline"
                size="sm"
                onClick={() => void onClearTable(table)}
                disabled={actionLoading === table}
                className={`gap-2 ${
                  confirmAction === table
                    ? "border-red-500 text-red-400"
                    : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {actionLoading === table ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : confirmAction === table ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                {confirmAction === table ? "Bekräfta?" : table}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center ${
                dbStats?.redis?.connected ? "bg-brand-teal/10" : "bg-red-500/10"
              }`}
            >
              <Server
                className={`h-5 w-5 ${
                  dbStats?.redis?.connected ? "text-brand-teal" : "text-red-400"
                }`}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Redis Cache</h2>
              <p className="text-sm text-gray-500">
                {dbStats?.redis?.connected ? (
                  <>
                    Ansluten • {dbStats.redis.memoryUsed} använt • {dbStats.redis.totalKeys} nycklar
                  </>
                ) : (
                  "Ej ansluten"
                )}
              </p>
            </div>
          </div>
          {dbStats?.redis?.connected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onFlushRedis()}
              disabled={actionLoading === "redis"}
              className={`gap-2 ${
                confirmAction === "redis"
                  ? "border-red-500 text-red-400"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {actionLoading === "redis" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : confirmAction === "redis" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirmAction === "redis" ? "Bekräfta?" : "Rensa cache"}
            </Button>
          )}
        </div>

        {!dbStats?.redis?.connected && (
          <div className="bg-brand-amber/10 border-brand-amber/30 text-brand-amber border p-4 text-sm">
            Redis är inte konfigurerat. Lägg till REDIS_URL eller KV_URL i .env.local för att
            aktivera caching.
          </div>
        )}
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
              <Wand2 className="text-brand-teal h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Template Cache</h2>
              <p className="text-sm text-gray-500">
                {dbStats?.database?.templateCache || 0} templates cachade
                {dbStats?.database?.templateCacheExpired ? (
                  <span className="text-brand-amber">
                    {" "}
                    • {dbStats.database.templateCacheExpired} utgångna
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setActionLoading("export-templates");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "export-templates" }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `templates-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showMessage(`Exporterade ${data.count} templates`);
                  }
                } catch {
                  showMessage("Export misslyckades");
                }
                setActionLoading(null);
              }}
              disabled={actionLoading === "export-templates"}
              className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              {actionLoading === "export-templates" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  setActionLoading("import-templates");
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const res = await fetch("/api/admin/database", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "import-templates",
                        templates: data.templates || data,
                      }),
                    });
                    const result = await res.json();
                    showMessage(result.message || "Import klar");
                    await refreshDbStats();
                  } catch {
                    showMessage("Import misslyckades");
                  }
                  setActionLoading(null);
                };
                input.click();
              }}
              disabled={actionLoading === "import-templates"}
              className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              {actionLoading === "import-templates" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setActionLoading("trigger-template-sync");
                try {
                  const res = await fetch("/api/admin/templates/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ includeEmbeddings: true }),
                  });
                  const data = (await res.json().catch(() => null)) as
                    | { success?: boolean; error?: string; message?: string }
                    | null;
                  if (!res.ok || !data?.success) {
                    throw new Error(data?.error || "Kunde inte starta template-sync");
                  }
                  showMessage(data.message || "Template-sync startad");
                } catch (err) {
                  showMessage(err instanceof Error ? err.message : "Kunde inte starta template-sync");
                }
                setActionLoading(null);
              }}
              disabled={actionLoading === "trigger-template-sync"}
              className="gap-2 border-brand-blue/50 text-brand-blue hover:bg-brand-blue/20 hover:text-white"
            >
              {actionLoading === "trigger-template-sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Synka mallar + embeddings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setActionLoading("extend-cache");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "extend-template-cache",
                    }),
                  });
                  const data = await res.json();
                  showMessage(data.message || "Cache förlängd");
                  await refreshDbStats();
                } catch {
                  showMessage("Kunde inte förlänga cache");
                }
                setActionLoading(null);
              }}
              disabled={actionLoading === "extend-cache"}
              className="border-brand-teal/50 text-brand-teal hover:bg-brand-teal/20 gap-2 hover:text-white"
            >
              {actionLoading === "extend-cache" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Förläng 30 dagar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (confirmAction !== "clear-templates") {
                  setConfirmAction("clear-templates");
                  return;
                }
                setActionLoading("clear-templates");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "clear-template-cache",
                    }),
                  });
                  const data = await res.json();
                  showMessage(data.message || "Cache rensad");
                  await refreshDbStats();
                } catch {
                  showMessage("Kunde inte rensa cache");
                }
                setActionLoading(null);
                setConfirmAction(null);
              }}
              disabled={actionLoading === "clear-templates"}
              className={`gap-2 ${
                confirmAction === "clear-templates"
                  ? "border-red-500 text-red-400"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {actionLoading === "clear-templates" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : confirmAction === "clear-templates" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirmAction === "clear-templates" ? "Bekräfta?" : "Rensa"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Spara templates lokalt för att undvika API-kostnader. Exportera → spara filen → importera
          på andra enheter. Knappen Synka mallar + embeddings triggar GitHub workflow för att
          uppdatera template-filerna i repot.
        </p>
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
              <HardDrive className="text-brand-blue h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Persistent Disk</h2>
              <p className="text-sm text-gray-500">
                {dbStats?.dataDir || "Ej konfigurerad"} • {dbStats?.uploads?.fileCount || 0} filer •{" "}
                {dbStats?.uploads?.totalSize || "0 B"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onClearUploads()}
            disabled={actionLoading === "uploads" || !dbStats?.uploads?.fileCount}
            className={`gap-2 ${
              confirmAction === "uploads"
                ? "border-red-500 text-red-400"
                : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            {actionLoading === "uploads" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : confirmAction === "uploads" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {confirmAction === "uploads" ? "Bekräfta?" : "Rensa uploads"}
          </Button>
        </div>

        {dbStats?.uploads?.files && dbStats.uploads.files.length > 0 && (
          <div className="border-t border-gray-800 pt-4">
            <h3 className="mb-3 text-sm font-medium text-gray-400">
              Uppladdade filer ({dbStats.uploads.fileCount} st)
            </h3>
            <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {dbStats.uploads.files.map((file, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-gray-500">
                  <span className="max-w-[250px] truncate">{file.name}</span>
                  <span className="font-mono text-xs">{file.size}</span>
                </div>
              ))}
              {dbStats.uploads.fileCount > 20 && (
                <p className="pt-2 text-xs text-gray-600">
                  ...och {dbStats.uploads.fileCount - 20} filer till
                </p>
              )}
            </div>
          </div>
        )}

        {dbStats?.dataDir && !dbStats.dataDir.includes("/var/data") && (
          <div className="bg-brand-amber/10 border-brand-amber/30 text-brand-amber mt-4 border p-4 text-sm">
            ⚠️ Persistent disk är inte konfigurerad. Lägg till DATA_DIR=/var/data i miljövariabler
            på Render för att bevara data mellan deploys.
          </div>
        )}
      </div>

      <div className="border border-red-500/30 bg-black/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-400">
          <AlertTriangle className="h-5 w-5" />
          Farozon
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Dessa åtgärder raderar data permanent. Kan inte ångras!
        </p>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (confirmAction !== "v0-cleanup") {
                  setConfirmAction("v0-cleanup");
                  return;
                }
                setActionLoading("v0-cleanup");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "cleanup-v0-projects",
                    }),
                  });
                  const data = await res.json();
                  showMessage(data.message || `Raderade ${data.deleted || 0} v0-projekt`);
                } catch {
                  showMessage("Misslyckades");
                }
                setActionLoading(null);
                setConfirmAction(null);
              }}
              disabled={actionLoading === "v0-cleanup"}
              className={`gap-2 ${
                confirmAction === "v0-cleanup"
                  ? "border-brand-warm text-brand-warm"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {actionLoading === "v0-cleanup" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : confirmAction === "v0-cleanup" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmAction === "v0-cleanup" ? "Bekräfta?" : "Rensa v0-projekt"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (confirmAction !== "vercel-cleanup") {
                  setConfirmAction("vercel-cleanup");
                  return;
                }
                setActionLoading("vercel-cleanup");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "cleanup-vercel-projects",
                    }),
                  });
                  const data = await res.json();
                  showMessage(data.message || `Raderade ${data.deleted || 0} Vercel-projekt`);
                } catch {
                  showMessage("Misslyckades");
                }
                setActionLoading(null);
                setConfirmAction(null);
              }}
              disabled={actionLoading === "vercel-cleanup"}
              className={`gap-2 ${
                confirmAction === "vercel-cleanup"
                  ? "border-brand-blue text-brand-blue"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {actionLoading === "vercel-cleanup" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : confirmAction === "vercel-cleanup" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmAction === "vercel-cleanup" ? "Bekräfta?" : "Rensa Vercel-projekt"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void onResetAll()}
              disabled={actionLoading === "reset-all"}
              className={`gap-2 ${
                confirmAction === "reset-all"
                  ? "border-brand-blue text-brand-blue"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {actionLoading === "reset-all" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : confirmAction === "reset-all" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmAction === "reset-all" ? "Bekräfta?" : "Rensa databas + Redis"}
            </Button>
          </div>

          <div className="border-t border-red-500/30 pt-4">
            <p className="mb-3 flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4" />
              MEGA CLEANUP - Raderar ALLT på alla 4 ställen
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                if (confirmAction !== "mega-cleanup") {
                  setConfirmAction("mega-cleanup");
                  return;
                }
                setActionLoading("mega-cleanup");
                try {
                  const res = await fetch("/api/admin/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "mega-cleanup" }),
                  });
                  const data = await res.json();
                  showMessage(data.message || "MEGA CLEANUP klar!", 10000);
                  await refreshDbStats();
                  await refreshStats();
                } catch {
                  showMessage("MEGA CLEANUP misslyckades");
                }
                setActionLoading(null);
                setConfirmAction(null);
              }}
              disabled={actionLoading === "mega-cleanup"}
              className={`gap-2 ${
                confirmAction === "mega-cleanup"
                  ? "border-red-500 bg-red-500/20 text-red-400"
                  : "border-red-500/50 text-red-400 hover:bg-red-500/10"
              }`}
            >
              {actionLoading === "mega-cleanup" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : confirmAction === "mega-cleanup" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirmAction === "mega-cleanup"
                ? "🔥 KLICKA IGEN FÖR ATT RADERA ALLT 🔥"
                : "🔥 MEGA CLEANUP (v0 + Vercel + Databas + Redis)"}
            </Button>
            <p className="mt-2 text-xs text-gray-600">
              Raderar: v0-projekt, Vercel-projekt, alla databastabeller, Redis-cache, uppladdade
              filer
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DbStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900/50 p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
