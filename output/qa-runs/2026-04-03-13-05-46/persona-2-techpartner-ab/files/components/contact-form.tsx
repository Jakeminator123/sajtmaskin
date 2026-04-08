"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";


import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button"
import HTMLFormElement from "@/components/html-form-element"
import FormStatus from "@/components/form-status"

type FormStatus = "idle" | "submitting" | "success";

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    window.setTimeout(() => {
      formRef.current?.reset();
      setStatus("success");
    }, 700);
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Ditt namn</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Anna Svensson"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-postadress</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="anna@foretag.se"
            className="h-11 rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefon</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="070-123 45 67"
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Meddelande</Label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          placeholder="Berätta kort om ert nuläge, vilka mål ni har och vilken typ av stöd ni söker."
          className="flex min-h-[160px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Vi använder formuläret för att planera ett första samtal och återkommer normalt inom en arbetsdag.
        </p>
        <Button
          type="submit"
          size="lg"
          className="rounded-full"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Skickar..." : "Skicka förfrågan"}
          {status === "submitting" ? null : <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {status === "success" ? (
          <p className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Tack, vi har tagit emot din förfrågan och återkommer inom en arbetsdag.
          </p>
        ) : null}
      </div>
    </form>
  );
}

export default ContactForm;
