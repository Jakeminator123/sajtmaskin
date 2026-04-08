"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
import ContactFormValues from "@/components/contact-form-values"
import { Form } from "@/components/ui/form"
import ContactFormValues from "@/components/contact-form-values"
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

const contactSchema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z.string().optional(),
  message: z.string().min(10, "Berätta gärna lite mer i ditt meddelande."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);

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
    setIsPending(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setIsPending(false);
    setSubmitted(true);
    form.reset(values);
  }

  if (submitted) {
    return (
      <Card className="surface-panel border-primary/20">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl tracking-tight">Tack! Vi har tagit emot ditt meddelande.</h2>
            <p className="text-muted-foreground">
              Vi återkommer inom kort. För catering går det bra att skriva datum, ungefärligt antal
              personer och om du vill ha leverans eller upphämtning när du skickar nästa förfrågan.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full active:scale-95">
              <Link href="/boka">Boka tid</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setSubmitted(false)}
              className="rounded-full border-primary/20 bg-background/60 active:scale-95"
            >
              Skicka ett nytt meddelande
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            Kontaktformuläret skickat.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="surface-panel">
      <CardContent className="p-6 sm:p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Namn</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ditt namn"
                        className="h-12 rounded-xl border-primary/15 bg-background/70"
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
                    <FormLabel>E-post</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="din@epost.se"
                        className="h-12 rounded-xl border-primary/15 bg-background/70"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="070-123 45 67"
                        className="h-12 rounded-xl border-primary/15 bg-background/70"
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
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meddelande</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Berätta gärna om cateringdatum, antal personer, preferenser eller din fråga"
                      className="min-h-36 rounded-2xl border-primary/15 bg-background/70"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-4 border-t border-border/70 pt-4">
              <Button type="submit" disabled={isPending} className="h-12 rounded-full active:scale-95">
                {isPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Skickar meddelande
                  </>
                ) : (
                  "Kontakta oss"
                )}
              </Button>
              <p className="sr-only" aria-live="polite">
                {isPending ? "Meddelandet skickas." : ""}
              </p>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default ContactForm;