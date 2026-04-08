"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";


import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/lib/site-data";
import { Button } from "@/components/ui/button"
import ContactFormValues from "@/components/contact-form-values"

const contactFormSchema = z.object({
  namn: z
    .string()
    .min(2, "Ange ditt namn så att vi vet vem vi ska återkomma till."),
  epost: z
    .string()
    .email("Ange en giltig e-postadress så att vi kan svara."),
  telefon: z
    .string()
    .optional()
    .refine(
      (value) => !value || /^[+0-9\s-]{6,}$/.test(value),
      "Ange ett giltigt telefonnummer eller lämna fältet tomt.",
    ),
  meddelande: z
    .string()
    .min(
      20,
      "Beskriv gärna ert nuläge lite mer så att vi kan förbereda ett relevant svar.",
    ),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const defaultValues: ContactFormValues = {
  namn: "",
  epost: "",
  telefon: "",
  meddelande: "",
};

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ContactFormValues) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmitted(true);
    form.reset(values);
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="namn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ditt namn</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Exempel: Anna Svensson"
                          className="h-12 rounded-2xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="epost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-postadress</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="namn@foretag.se"
                          className="h-12 rounded-2xl"
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
                name="telefon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="070-123 45 67"
                        className="h-12 rounded-2xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="meddelande"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meddelande</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Berätta kort om mål, nuläge och vad ni vill få hjälp med."
                        className="min-h-36 rounded-2xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="submit"
                  size="lg"
                  className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Skickar..." : "Skicka"}
                  {!form.formState.isSubmitting && (
                    <ArrowRight className="ml-2 h-4 w-4" />
                  )}
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="lg"
                  className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                >
                  <a href={siteConfig.bookingHref}>Boka tid</a>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div aria-live="polite">
        {submitted ? (
          <Card className="rounded-3xl border-primary/15 bg-primary/5 shadow-sm">
            <CardContent className="flex gap-4 p-6">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  Tack, vi har tagit emot din förfrågan.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Vi återkommer vanligtvis inom en arbetsdag med nästa steg och
                  ett förslag på hur vi kan hjälpa er vidare. Om det är bråttom
                  går det också bra att ringa oss på {siteConfig.phoneDisplay}.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export default ContactForm;
