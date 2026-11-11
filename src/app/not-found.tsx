import Link from "next/link";
import { Footer } from "@/components/layout/footer";

const NAV_LINKS = [
  { href: "/priser", label: "Priser" },
  { href: "/exempel", label: "Exempel" },
  { href: "/templates", label: "Mallar" },
  { href: "/faq", label: "FAQ" },
] as const;

export default function NotFound() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/30 border-b">
        <nav
          aria-label="Huvudmeny"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4"
        >
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sajtmaskin
          </Link>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <p className="text-muted-foreground mb-2 text-6xl font-bold">404</p>
          <h1 className="mb-4 text-xl font-semibold">Sidan hittades inte</h1>
          <p className="text-muted-foreground mb-8">
            Sidan du letar efter finns inte eller har flyttats.
          </p>
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-block rounded-lg px-6 py-3 font-medium transition-colors"
          >
            Till startsidan
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
