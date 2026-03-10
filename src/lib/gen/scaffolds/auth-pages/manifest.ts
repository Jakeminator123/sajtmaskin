import type { ScaffoldManifest } from "../types";

export const authPagesManifest: ScaffoldManifest = {
  id: "auth-pages",
  family: "auth-pages",
  label: "Auth Pages",
  description:
    "Login, signup, and forgot-password pages with form layout, validation-ready structure, and minimal branding.",
  buildIntents: ["website", "app", "template"],
  tags: [
    "auth",
    "login",
    "signup",
    "register",
    "password",
    "inloggning",
    "registrering",
  ],
  promptHints: [
    "Use this scaffold for authentication flows: login, signup, forgot password.",
    "Keep the form layout, validation structure, and link flow between auth pages. Replace branding and copy.",
    "Add OAuth buttons or additional fields as needed. Preserve the centered card layout.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.14 0.004 250);
  --color-foreground: oklch(0.95 0.003 250);
  --color-card: oklch(0.18 0.004 250);
  --color-card-foreground: oklch(0.95 0.003 250);
  --color-primary: oklch(0.6 0.18 250);
  --color-primary-foreground: oklch(0.98 0.003 250);
  --color-secondary: oklch(0.22 0.005 250);
  --color-secondary-foreground: oklch(0.9 0.003 250);
  --color-muted: oklch(0.2 0.004 250);
  --color-muted-foreground: oklch(0.6 0.01 250);
  --color-accent: oklch(0.24 0.005 250);
  --color-accent-foreground: oklch(0.9 0.003 250);
  --color-border: oklch(0.26 0.005 250);
  --color-input: oklch(0.2 0.005 250);
  --color-ring: oklch(0.6 0.18 250);
  --radius: 0.75rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Auth Pages Starter",
  description: "Login, signup, and forgot-password pages with form layout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className={\`\${inter.variable} antialiased\`}>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Auth Pages Starter</h1>
        <p className="text-muted-foreground max-w-md">
          This scaffold provides login, signup, and forgot-password pages. Replace the landing with your app home or redirect.
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/login">
            Logga in <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link href="/signup">Registrera</Link>
        </Button>
      </div>
    </main>
  );
}
`,
    },
    {
      path: "app/login/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Logga in</CardTitle>
          <CardDescription>Ange dina uppgifter för att logga in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Lösenord</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Glömt lösenord?
              </Link>
            </div>
            <Input id="password" type="password" placeholder="••••••••" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Logga in</Button>
          <p className="text-sm text-muted-foreground">
            Har du inget konto?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Registrera
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
`,
    },
    {
      path: "app/signup/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Skapa konto</CardTitle>
          <CardDescription>Fyll i uppgifterna för att registrera dig</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Namn</Label>
            <Input id="name" type="text" placeholder="Ditt namn" className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Lösenord</Label>
            <Input id="password" type="password" placeholder="••••••••" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Registrera</Button>
          <p className="text-sm text-muted-foreground">
            Har du redan ett konto?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Logga in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
`,
    },
    {
      path: "app/forgot-password/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Återställ lösenord</CardTitle>
          <CardDescription>
            Ange din e-postadress så skickar vi en länk för att återställa lösenordet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Skicka återställningslänk</Button>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till inloggning
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
`,
    },
  ],
};
