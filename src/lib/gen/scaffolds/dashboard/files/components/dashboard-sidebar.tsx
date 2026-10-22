"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, BarChart3, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Översikt", href: "/", icon: LayoutDashboard },
  { label: "Analys", href: "/analytics", icon: BarChart3 },
  { label: "Användare", href: "/users", icon: Users },
  { label: "Inställningar", href: "/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-border bg-card flex h-full w-(--sidebar-width) flex-col border-r">
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-bold tracking-tight">Instrumentpanel</span>
      </div>

      <div className="space-y-1 px-6 pb-4">
        <p className="text-sm font-medium">Demodata — inte ansluten</p>
        <p className="text-muted-foreground text-xs">
          Mätetal, användare och aktivitet är exempel.
        </p>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Button
              key={item.href}
              variant={active ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 text-sm",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              asChild
            >
              <Link href={item.href}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/20 text-primary text-xs">AD</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Demoanvändare — ingen session</p>
          <p className="text-muted-foreground truncate text-xs">admin@example.com</p>
        </div>
      </div>
    </aside>
  );
}
