import {
  Activity,
  Coins,
  Database,
  FileText,
  Key,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

/**
 * What a section does to the system — rendered as a badge in the menu and on the
 * overview page so it is obvious where you only *look* and where you *change*.
 */
export type AdminSectionKind = "read" | "write" | "danger";

export interface AdminSection {
  /** Route href. Must match a real `page.tsx` under `src/app/admin/` (see admin-nav.test.ts). */
  href: string;
  /** Short Swedish menu label. */
  label: string;
  /** One-line description in plain Swedish — no jargon, no file paths. */
  description: string;
  icon: LucideIcon;
  kind: AdminSectionKind;
}

export const ADMIN_SECTION_KIND_LABEL: Record<AdminSectionKind, string> = {
  read: "Läser",
  write: "Ändrar",
  danger: "Kan radera",
};

/**
 * Single source of truth for the admin console navigation. The sidebar, the
 * overview page and the nav parity test all read this list — never a second
 * hand-maintained copy.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    href: "/admin",
    label: "Översikt",
    description: "Läget just nu: databas, cache, miljö och senaste aktivitet.",
    icon: LayoutDashboard,
    kind: "read",
  },
  {
    href: "/admin/statistik",
    label: "Statistik",
    description: "Besök, nya användare och nya projekt över tid.",
    icon: Activity,
    kind: "read",
  },
  {
    href: "/admin/genereringar",
    label: "Genereringar",
    description: "Självkostnad, användardebitering och påslag per AI-generering.",
    icon: Coins,
    kind: "write",
  },
  {
    href: "/admin/data",
    label: "Data & lagring",
    description: "Innehåll i databasen, cache och uppladdade filer. Städning finns här.",
    icon: Database,
    kind: "danger",
  },
  {
    href: "/admin/miljo",
    label: "Miljö",
    description: "Nycklar, integrationer och kopplingen till Vercel.",
    icon: Key,
    kind: "read",
  },
  {
    href: "/admin/loggar",
    label: "Loggar",
    description: "Körningsloggar från appen och sparade promptar.",
    icon: FileText,
    kind: "read",
  },
] as const;

/** Longest-prefix match so `/admin/data` wins over `/admin` on sub-paths. */
export function resolveActiveSection(pathname: string): AdminSection | undefined {
  const candidates = ADMIN_SECTIONS.filter(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
  return candidates.sort((a, b) => b.href.length - a.href.length)[0];
}
