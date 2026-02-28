"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Database,
  FolderOpen,
  Key,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  EnvStatusPayload,
  IntegrationStatus,
  TeamStatus,
  VercelEnvVar,
  VercelProject,
} from "./types";
import { EnvCompare } from "./EnvCompare";

interface AdminEnvironmentTabProps {
  teamStatusLoading: boolean;
  teamStatus: TeamStatus | null;
  envLoading: boolean;
  envError: string | null;
  envStatus: EnvStatusPayload | null;
  integrationStatus: IntegrationStatus | null;
  vercelProjects: VercelProject[];
  vercelProjectsLoading: boolean;
  vercelProjectsError: string | null;
  selectedVercelProjectId: string | null;
  setSelectedVercelProjectId: Dispatch<SetStateAction<string | null>>;
  vercelEnvVars: VercelEnvVar[];
  vercelEnvLoading: boolean;
  confirmVercelProjectId: string | null;
  actionLoading: string | null;
  onRefreshVercelProjects: () => void | Promise<void>;
  onDeleteVercelProject: (project: VercelProject) => void | Promise<void>;
}

export function AdminEnvironmentTab({
  teamStatusLoading,
  teamStatus,
  envLoading,
  envError,
  envStatus,
  integrationStatus,
  vercelProjects,
  vercelProjectsLoading,
  vercelProjectsError,
  selectedVercelProjectId,
  setSelectedVercelProjectId,
  vercelEnvVars,
  vercelEnvLoading,
  confirmVercelProjectId,
  actionLoading,
  onRefreshVercelProjects,
  onDeleteVercelProject,
}: AdminEnvironmentTabProps) {
  return (
    <div className="space-y-6">
      {teamStatusLoading && (
        <div className="flex items-center gap-2 border border-gray-800 bg-black/50 p-4 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Hämtar Vercel team-status...
        </div>
      )}

      {teamStatus && teamStatus.warnings.length > 0 && (
        <div className="space-y-2">
          {teamStatus.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-3 border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="text-amber-200">{warning}</div>
            </div>
          ))}
        </div>
      )}

      {teamStatus && teamStatus.teams.length > 0 && (
        <div className="border border-gray-800 bg-black/50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
              <Users className="text-brand-teal h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Vercel Teams</h2>
              <p className="text-sm text-gray-500">Team-planer</p>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {teamStatus.teams.map((team) => {
              const isConfigured = team.id === teamStatus.configuredTeamId;
              return (
                <div
                  key={team.id}
                  className={`border p-3 text-sm ${
                    isConfigured
                      ? "border-brand-teal/50 bg-brand-teal/5 ring-1 ring-brand-teal/30"
                      : "border-gray-800 bg-black/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200">{team.name}</span>
                        {isConfigured && <span className="text-xs text-brand-teal">(konfigurerat)</span>}
                      </div>
                      <div className="text-xs text-gray-500">{team.slug}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          team.isFree
                            ? "bg-amber-500/20 text-amber-400"
                            : team.isPro
                              ? "bg-green-500/20 text-green-400"
                              : team.isEnterprise
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {team.plan === "hobby"
                          ? "Free (Hobby)"
                          : team.plan.charAt(0).toUpperCase() + team.plan.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EnvCompare />

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
            <Server className="text-brand-teal h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Runtime</h2>
            <p className="text-sm text-gray-500">Aktiv miljö och bas-URL</p>
          </div>
        </div>

        {envLoading && <p className="text-sm text-gray-500">Laddar miljöstatus...</p>}
        {envError && <p className="text-sm text-red-400">{envError}</p>}

        {envStatus && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-gray-800 bg-black/30 p-4">
              <div className="text-xs text-gray-500">NODE_ENV</div>
              <div className="text-sm text-white">{envStatus.runtime.nodeEnv || "okänd"}</div>
            </div>
            <div className="border border-gray-800 bg-black/30 p-4">
              <div className="text-xs text-gray-500">VERCEL_ENV</div>
              <div className="text-sm text-white">{envStatus.runtime.vercelEnv || "lokal"}</div>
            </div>
            <div className="border border-gray-800 bg-black/30 p-4">
              <div className="text-xs text-gray-500">Base URL</div>
              <div className="text-sm text-white">{envStatus.runtime.baseUrl}</div>
            </div>
            <div className="border border-gray-800 bg-black/30 p-4">
              <div className="text-xs text-gray-500">Vercel URL</div>
              <div className="text-sm text-white">{envStatus.runtime.vercelUrl || "ej tillgänglig"}</div>
            </div>
          </div>
        )}
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
            <Wand2 className="text-brand-teal h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Integrationer</h2>
            <p className="text-sm text-gray-500">Status per integration</p>
          </div>
        </div>

        {!integrationStatus ? (
          <p className="text-sm text-gray-500">Laddar integrationsstatus...</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {integrationStatus.items.map((item) => (
              <div key={item.id} className="border border-gray-800 bg-black/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-200">{item.label}</span>
                  <span className={item.enabled ? "text-green-400" : "text-red-400"}>
                    {item.enabled ? "OK" : item.required ? "Saknas" : "Valfri"}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{item.affects}</div>
                {item.notes && <div className="text-xs text-gray-600">Info: {item.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
            <Key className="text-brand-teal h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Env-nycklar (runtime)</h2>
            <p className="text-sm text-gray-500">Visar endast om nyckeln finns</p>
          </div>
        </div>

        {!envStatus ? (
          <p className="text-sm text-gray-500">Laddar env-status...</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {envStatus.keys.map((item) => (
              <div key={item.key} className="border border-gray-800 bg-black/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-300">{item.key}</span>
                  <span className={item.present ? "text-green-400" : "text-red-400"}>
                    {item.present ? "Satt" : item.required ? "Saknas" : "Valfri"}
                  </span>
                </div>
                {item.notes && <div className="text-xs text-gray-500">{item.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
              <FolderOpen className="text-brand-blue h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Vercel-projekt</h2>
              <p className="text-sm text-gray-500">Lista och radera projekt</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefreshVercelProjects()}
            disabled={vercelProjectsLoading}
            className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${vercelProjectsLoading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>

        {vercelProjectsError && <p className="text-sm text-red-400">{vercelProjectsError}</p>}
        {vercelProjectsLoading && <p className="text-sm text-gray-500">Hämtar Vercel-projekt...</p>}
        {!vercelProjectsLoading && vercelProjects.length === 0 && (
          <p className="text-sm text-gray-500">Inga projekt hittades.</p>
        )}

        {vercelProjects.length > 0 && (
          <div className="space-y-2">
            {vercelProjects.map((project) => {
              const isConfirm = confirmVercelProjectId === project.id;
              const isLoading = actionLoading === `vercel:${project.id}`;
              const isSelected = selectedVercelProjectId === project.id;
              return (
                <div
                  key={project.id}
                  className={`border border-gray-800 bg-black/30 p-3 text-sm ${
                    isSelected ? "ring-1 ring-brand-teal/60" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-gray-200">{project.name}</div>
                      <div className="text-xs text-gray-500">ID: {project.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVercelProjectId(project.id)}
                        className="border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                      >
                        Visa env
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onDeleteVercelProject(project)}
                        disabled={isLoading}
                        className={`gap-2 ${
                          isConfirm
                            ? "border-red-500 text-red-400"
                            : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isConfirm ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        {isConfirm ? "Bekräfta?" : "Radera"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
            <Database className="text-brand-blue h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Vercel env-variabler</h2>
            <p className="text-sm text-gray-500">Visar nycklar + targets</p>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Projekt:</span>
          <select
            value={selectedVercelProjectId ?? ""}
            onChange={(e) => setSelectedVercelProjectId(e.target.value || null)}
            className="border border-gray-700 bg-black/50 px-3 py-2 text-xs text-white"
          >
            <option value="">Välj projekt</option>
            {vercelProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {vercelEnvLoading && <p className="text-sm text-gray-500">Hämtar env-variabler...</p>}
        {!vercelEnvLoading && selectedVercelProjectId && vercelEnvVars.length === 0 && (
          <p className="text-sm text-gray-500">Inga env-variabler hittades.</p>
        )}

        {vercelEnvVars.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {vercelEnvVars.map((envVar) => (
              <div key={envVar.id || envVar.key} className="border border-gray-800 bg-black/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-300">{envVar.key}</span>
                  <span className="text-xs text-gray-500">
                    {envVar.target.length > 0 ? envVar.target.join(", ") : "ingen target"}
                  </span>
                </div>
                {envVar.type && <div className="text-xs text-gray-600">Typ: {envVar.type}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
