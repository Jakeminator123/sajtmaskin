'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Heart, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Hem', icon: Home },
    { href: '/zelda', label: 'Zelda blogg', icon: Sparkles },
    { href: '/blanka', label: 'Blanka blogg', icon: Heart },
    { href: '/spel', label: 'Spel', icon: Gamepad2 },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-primary/20 bg-white/95 backdrop-blur-lg shadow-lg supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-zelda-pink to-blanka-teal text-white font-bold text-xl shadow-lg transition-transform group-hover:rotate-3 group-hover:scale-105">
              Z&B
            </div>
            <span className="hidden font-bold text-2xl text-foreground sm:block">
              Zelda & Blanka
            </span>
          </Link>

          <div className="flex gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                    isActive
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-md scale-105'
                      : 'text-muted-foreground hover:bg-gradient-to-r hover:from-primary/10 hover:to-secondary/10 hover:text-foreground hover:scale-105'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
