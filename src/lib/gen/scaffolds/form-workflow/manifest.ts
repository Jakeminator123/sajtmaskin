import type { ScaffoldManifest } from "../types";

export const formWorkflowManifest: ScaffoldManifest = {
  id: "form-workflow",
  family: "form-workflow",
  label: "Form / Workflow / Booking",
  description:
    "Multi-step form starter with booking flow, intake/application page, confirmation, and calendar picker — ideal for bookings, surveys, quizzes, calculators, and intake forms.",
  allowedBuildIntents: ["website", "template"],
  tags: [
    "booking",
    "form",
    "survey",
    "quiz",
    "calculator",
    "application",
    "intake",
    "multi-step",
    "wizard",
    "appointment",
  ],
  promptHints: [
    "Use this scaffold for booking systems, surveys, multi-step forms, quizzes, calculators, and application/intake flows.",
    "Keep the form rhythm: progress indicator, step-by-step fields, validation feedback, and a confirmation page.",
    "Adapt form fields, steps, and confirmation content to the user's domain instead of replacing the workflow structure.",
  ],
  qualityChecklist: [
    "Multi-step navigation should show clear progress and allow going back.",
    "Form validation should display inline errors using FormMessage or FieldError.",
    "The confirmation page should summarize what was submitted.",
    "Calendar/date pickers should be wired with proper form state.",
  ],
  research: {
    upgradeTargets: [
      "Add conditional fields that show/hide based on previous answers.",
      "Add file upload step for document intake flows.",
      "Add email confirmation / booking reference number generation.",
    ],
    referenceTemplates: [],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.14 0.004 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.14 0.004 0);
  --color-primary: oklch(0.52 0.17 160);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0.005 160);
  --color-secondary-foreground: oklch(0.2 0.02 160);
  --color-muted: oklch(0.96 0.004 0);
  --color-muted-foreground: oklch(0.45 0.004 0);
  --color-accent: oklch(0.94 0.005 160);
  --color-accent-foreground: oklch(0.2 0.02 160);
  --color-border: oklch(0.92 0.004 0);
  --color-ring: oklch(0.52 0.17 160);
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
  title: "Booking & Forms",
  description: "Multi-step booking and form workflow.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={inter.variable}>
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ClipboardList, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <div className="space-y-4 text-center">
        <Badge variant="secondary" className="rounded-full">Booking & Forms</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Book your appointment
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Choose a service below to get started. Fill out the form and receive a confirmation.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <Link href="/booking">
          <Card className="h-full transition-colors hover:border-primary/30">
            <CardHeader>
              <CalendarDays className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Book Appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Select a date and time, fill in your details, and confirm.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Start booking <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/apply">
          <Card className="h-full transition-colors hover:border-primary/30">
            <CardHeader>
              <ClipboardList className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Apply / Intake Form</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Submit an application or intake form with multiple steps.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Start application <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/booking/page.tsx",
      content: `"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

const steps = ["Service", "Date & Time", "Your Details"];

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const router = useRouter();

  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Step {step + 1} of {steps.length}</p>
          <Progress value={progress} className="h-2" />
          <h1 className="text-2xl font-semibold tracking-tight">{steps[step]}</h1>
        </div>

        <Separator />

        <Card>
          <CardContent className="space-y-4 pt-6">
            {step === 0 && (
              <div className="space-y-3">
                <Label htmlFor="service">Select a service</Label>
                <Select>
                  <SelectTrigger id="service"><SelectValue placeholder="Choose service..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <Label>Pick a date</Label>
                <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" placeholder="Your name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" placeholder="+46 70 123 4567" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => router.push("/confirmation")}>Confirm Booking</Button>
          )}
        </div>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/apply/page.tsx",
      content: `"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

export default function ApplyPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Application Form</h1>
          <p className="text-muted-foreground">Fill out the form below. All fields marked are required.</p>
        </div>

        <Separator />

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" placeholder="Your full name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applyEmail">Email</Label>
              <Input id="applyEmail" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Tell us about yourself</Label>
              <Textarea id="message" placeholder="Brief description..." rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="terms" />
              <Label htmlFor="terms" className="text-sm text-muted-foreground">
                I agree to the terms and conditions
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => router.push("/confirmation")}>Submit Application</Button>
        </div>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/confirmation/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

export default function ConfirmationPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <Card>
        <CardContent className="space-y-4 pt-8 pb-8">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <Badge variant="secondary" className="rounded-full">Confirmed</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Thank you!</h1>
          <p className="text-muted-foreground">
            Your submission has been received. We will get back to you shortly.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    },
  ],
};
