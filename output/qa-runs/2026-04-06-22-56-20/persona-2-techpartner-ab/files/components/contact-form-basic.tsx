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
import BasicContactValues from "@/components/basic-contact-values"

const basicContactSchema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  message: z
    .string()
    .min(20, "Skriv minst 20 tecken i meddelandet.")
    .max(1200, "Meddelandet är för långt."),
});

type BasicContactValues = z.infer<typeof basicContactSchema>;

export function ContactFormBasic() {
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<BasicContactValues>({
    resolver: zodResolver(basicContactSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  async function onSubmit(values: BasicContactValues) {
    setStatusMessage("");
    await new Promise((resolve) => setTimeout(resolve, 700));
    form.reset();
    setStatusMessage(
      `Tack ${values.name}, vi har tagit emot ditt meddelande och återkommer inom kort.`,
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Skicka ett meddelande</h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Beskriv gärna ert nuläge, mål och tidplan. Ju mer sammanhang ni delar,
          desto bättre kan vi förbereda en relevant första återkoppling.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Namn</FormLabel>
                <FormControl>
                  <Input placeholder="Anna Andersson" autoComplete="name" {...field} />
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

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meddelande</FormLabel>
                <FormControl>
                  <textarea
                    className="min-h-36 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Berätta kort vad ni vill ha hjälp med."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Genom att skicka formuläret godkänner du att vi kontaktar dig om din
              förfrågan.
            </p>
            <Button
              type="submit"
              size="lg"
              className="active:scale-95 transition-all duration-200"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Skickar..." : "Skicka meddelande"}
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <p aria-live="polite" role="status" className="min-h-6 text-sm text-foreground">
            {statusMessage}
          </p>
        </form>
      </Form>
    </div>
  );
}

export default ContactFormBasic;