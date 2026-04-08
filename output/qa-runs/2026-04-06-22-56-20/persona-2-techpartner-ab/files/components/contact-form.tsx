"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import ContactFormValues from "@/components/contact-form-values"

const contactSchema = z.object({
  name: z
    .string()
    .min(2, "Ange ditt namn.")
    .max(100, "Namnet är för långt."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .min(8, "Ange ett telefonnummer.")
    .regex(/^[0-9+\-\s]+$/, "Ange ett giltigt telefonnummer."),
  message: z
    .string()
    .min(20, "Beskriv gärna ert behov med minst 20 tecken.")
    .max(2000, "Meddelandet är för långt."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  async function onSubmit(values: ContactFormValues) {
    setStatusMessage("");
    await new Promise((resolve) => setTimeout(resolve, 900));
    form.reset();
    setStatusMessage(
      `Tack ${values.name}. Vi har tagit emot din förfrågan och återkommer så snart vi kan.`,
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Berätta kort om ert behov
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Ju tydligare ni beskriver nuläge, mål och eventuella utmaningar, desto
          bättre kan vi förbereda nästa steg. Vi återkopplar med ett konkret
          förslag på hur ett första möte kan se ut.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ditt namn</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Anna Andersson"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-postadress</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="anna@foretag.se"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input
                    placeholder="070-123 45 67"
                    autoComplete="tel"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meddelande</FormLabel>
                <FormControl>
                  <textarea
                    className="min-h-36 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Beskriv gärna vad ni vill förbättra, bygga nytt eller få hjälp med."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Genom att skicka formuläret godkänner du att vi kontaktar dig för
              att följa upp din förfrågan. Vi använder endast uppgifterna för
              dialog kring ert ärende.
            </p>

            <Button
              type="submit"
              size="lg"
              className="active:scale-95 transition-all duration-200"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Skickar..." : "Skicka förfrågan"}
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <p
            aria-live="polite"
            role="status"
            className="min-h-6 text-sm text-foreground"
          >
            {statusMessage}
          </p>
        </form>
      </Form>
    </div>
  );
}

export default ContactForm;
