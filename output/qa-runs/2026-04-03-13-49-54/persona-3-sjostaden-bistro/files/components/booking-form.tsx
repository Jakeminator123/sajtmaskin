"use client";
import Link from "next/link";



import { useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react"
import { zodResolver } from "@hookform/resolvers/zod";
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
import BookingFormValues from "@/components/booking-form-values"

const bookingSchema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z.string().min(8, "Ange ett telefonnummer."),
  date: z.string().min(1, "Välj ett datum."),
  time: z.string().min(1, "Välj en tid."),
  message: z.string().max(500, "Meddelandet får vara högst 500 tecken.").optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export function BookingForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      date: "",
      time: "",
      message: "",
    },
  });

  async function onSubmit(values: BookingFormValues) {
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
            <h2 className="text-2xl tracking-tight">Tack! Vi har tagit emot din bokningsförfrågan.</h2>
            <p className="max-w-2xl text-muted-foreground">
              Vi återkommer inom kort via e-post eller telefon för att bekräfta tiden. Om det är
              brådskande, ring oss på {siteConfig.phone}.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full active:scale-95">
              <Link href="/meny">Se menyn</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setSubmitted(false)}
              className="rounded-full border-primary/20 bg-background/60 active:scale-95"
            >
              Skicka en ny förfrågan
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            Bokningsförfrågan skickad.
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
                  <FormItem>
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

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
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
                  name="time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tid</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          className="h-12 rounded-xl border-primary/15 bg-background/70"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meddelande</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Till exempel allergier, barnvagn, firande eller sällskapets storlek"
                      className="min-h-32 rounded-2xl border-primary/15 bg-background/70"
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
                    Skickar bokning
                  </>
                ) : (
                  "Boka tid"
                )}
              </Button>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Genom att skicka formuläret godkänner du att vi kontaktar dig angående din bokning.
              </p>
              <p className="sr-only" aria-live="polite">
                {isPending ? "Bokningsförfrågan skickas." : ""}
              </p>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default BookingForm;
