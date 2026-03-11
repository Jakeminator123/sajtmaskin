import envPolicy from "../../config/env-policy.json";
import { serverSchema } from "@/lib/env";

export type VercelTarget = "development" | "preview" | "production";
export type EnvValueState = "set" | "empty" | "placeholder" | "missing";
export type EnvClassification =
  | "shared_runtime"
  | "optional_runtime"
  | "environment_specific"
  | "local_only"
  | "vercel_managed";

export interface EnvRule {
  key: string;
  classification: EnvClassification;
  recommendedVercelTargets: VercelTarget[];
  notes?: string;
}

interface EnvPolicyFile {
  knownEmptyOk: string[];
  runtimeOnlyKeys: string[];
  extraKnownKeys: string[];
  rules: EnvRule[];
}

const policy = envPolicy as EnvPolicyFile;

const ALL_TARGETS: VercelTarget[] = ["development", "preview", "production"];
const DEPLOY_TARGETS: VercelTarget[] = ["preview", "production"];

export const KNOWN_EMPTY_OK = new Set<string>(policy.knownEmptyOk);
export const RUNTIME_ONLY_KEYS = new Set<string>(policy.runtimeOnlyKeys);

const RULES: EnvRule[] = policy.rules;
const RULE_BY_KEY = new Map(RULES.map((rule) => [rule.key, rule]));
const EXTRA_KNOWN_KEYS = [...policy.extraKnownKeys];

export function inspectEnvValue(value: string | undefined): EnvValueState {
  if (value == null) return "missing";
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed) || /^\$[A-Z0-9_]+$/.test(trimmed)) {
    return "placeholder";
  }
  if (/(placeholder|changeme|example|todo|replace-me)/i.test(trimmed)) {
    return "placeholder";
  }
  return "set";
}

export function getKnownEnvKeys(): string[] {
  const keys = new Set<string>([
    ...Object.keys(serverSchema.shape),
    ...EXTRA_KNOWN_KEYS,
    ...RULE_BY_KEY.keys(),
  ]);
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function getEnvRule(key: string): EnvRule {
  const explicit = RULE_BY_KEY.get(key);
  if (explicit) return explicit;

  if (key === "VERCEL" || key === "VERCEL_ENV" || key === "VERCEL_URL") {
    return {
      key,
      classification: "vercel_managed",
      recommendedVercelTargets: [],
      notes: "Satts automatiskt av Vercel vid deployment/runtime.",
    };
  }

  if (
    key.startsWith("NEXT_PUBLIC_") ||
    key.endsWith("_REDIRECT_URI")
  ) {
    return {
      key,
      classification: "environment_specific",
      recommendedVercelTargets: DEPLOY_TARGETS,
      notes: "Publikt eller miljo-beroende varde som ofta skiljer mellan localhost och deployment.",
    };
  }

  if (key.startsWith("SAJTMASKIN_")) {
    return {
      key,
      classification: "environment_specific",
      recommendedVercelTargets: DEPLOY_TARGETS,
      notes: "Miljo- och budgettuning som ofta skiljer mellan lokal utveckling och deployad miljo.",
    };
  }

  if (
    key.includes("TOKEN") ||
    key.includes("SECRET") ||
    key.includes("PASSWORD") ||
    key.includes("KEY") ||
    key.includes("URL")
  ) {
    return {
      key,
      classification: "optional_runtime",
      recommendedVercelTargets: ALL_TARGETS,
      notes: "Runtime-varde som kan behova finnas pa Vercel om funktionen anvands.",
    };
  }

  return {
    key,
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Ingen specialregel definierad; verifiera anvandning innan sync.",
  };
}

export function hasAllTargets(
  actualTargets: string[],
  recommendedTargets: VercelTarget[],
): boolean {
  if (recommendedTargets.length === 0) return true;
  const actual = new Set(actualTargets);
  return recommendedTargets.every((target) => actual.has(target));
}
