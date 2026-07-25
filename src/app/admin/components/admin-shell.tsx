"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/auth-store";
import { cn } from "@/lib/utils";
import {
  ADMIN_SECTIONS,
  ADMIN_SECTION_KIND_LABEL,
  resolveActiveSection,
  type AdminSectionKind,
} from "../admin-nav";

const KIND_BADGE_CLASS: Record<AdminSectionKind, string> = {
  read: "border-border text-muted-foreground",
  write: "border-primary/40 text-primary",
  danger: "border-destructive/40 text-destructive",
};

/**
 * Chrome around every `/admin` section: title, signed-in admin, section menu.
 *
 * The page shell is rendered *after* the server-side admin gate in
 * `src/app/admin/layout.tsx`, so there is deliberately no client-side auth
 * check here (the old `localStorage["admin-auth"]` login form was removed —
 * `src/proxy.ts` already redirects non-admins away from `/admin`).
 */
export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const active = resolveActiveSection(pathname ?? "/admin");

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="admin-print-root bg-background min-h-screen">
      <header className="bg-background/80 border-border sticky top-0 z-20 border-b backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Till appen
            </Link>
          </Button>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Adminpanel</h1>
            <p className="text-muted-foreground truncate text-xs">{adminEmail}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* The labels collapse on small screens, so the buttons need an
                explicit accessible name — a CSS-hidden span exposes none. */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.print()}
              title="Skriver ut den sektion du står på"
              aria-label="Skriv ut den här sektionen"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Skriv ut</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={handleLogout}
              aria-label="Logga ut"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logga ut</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Printing a dark console wastes ink and hides thin borders — flatten it
          to black-on-white. Scoped to the admin root so nothing else is affected. */}
      <style>{`
        @media print {
          .admin-print-root, .admin-print-root * {
            background: #fff !important;
            color: #000 !important;
            border-color: #d4d4d8 !important;
            box-shadow: none !important;
          }
          .admin-print-root pre, .admin-print-root code {
            white-space: pre-wrap !important;
            word-break: break-word !important;
          }
        }
      `}</style>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-8">
        <nav
          aria-label="Adminsektioner"
          className="flex gap-2 overflow-x-auto pb-1 lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0 print:hidden"
        >
          {ADMIN_SECTIONS.map((section) => {
            const isActive = active?.href === section.href;
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors lg:shrink",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{section.label}</span>
                {section.kind !== "read" && (
                  <Badge
                    variant="outline"
                    className={cn("ml-auto hidden text-[10px] lg:inline-flex", KIND_BADGE_CLASS[section.kind])}
                  >
                    {ADMIN_SECTION_KIND_LABEL[section.kind]}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1">
          {active && (
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
              <p className="text-muted-foreground text-sm">{active.description}</p>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
