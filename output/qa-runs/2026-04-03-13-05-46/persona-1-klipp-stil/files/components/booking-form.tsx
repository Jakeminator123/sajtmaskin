"use client";

import Link from "next/link";
import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import BookingFormValues from "@/components/booking-form-values"

const bookingSchema = z.object({
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .min(8, "Ange ett telefonnummer.")
    .regex(
      /^[0-9+\-\s]+$/,
      "Telefonnumret får bara innehålla siffror, mellanslag, plus och bindestreck.",
    ),
  date: z.string().min(1, "Välj ett datum."),
  time: z.string().min(1, "Välj en tid."),
  message: z.string().max(600, "Meddelandet får vara högst 600 tecken.").optional(),
  consent: z.boolean().optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export function BookingForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      date: "",
      time: "",
      message: "",
      consent: false,
    },
  });

  function onSubmit(values: BookingFormValues) {
    setSubmitted(true);
    form.reset(values);
  }

  if (submitted) {
    return (
      <div className="section-shell p-8 sm:p-10" aria-live="polite">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary/30 text-accent">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Tack! Vi har tagit emot din bokningsförfrågan.</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Vi återkommer via e-post eller telefon inom kort för att bekräfta tiden. Har du
                bråttom är du varmt välkommen att ringa 031-123 45 67 så hjälper vi dig direkt.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/">Tillbaka till Hem</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full transition-all duration-200 active:scale-95"
              >
                <Link href="/priser">Se priser</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="justify-start rounded-full px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => {
                  setSubmitted(false);
                  form.reset();
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Skicka en ny förfrågan
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Namn</FormLabel>
                <FormControl>
                  <Input placeholder="Ditt namn" {...field} />
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
                  <Input type="email" placeholder="din@epost.se" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="031-123 45 67" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Datum</FormLabel>
                  <FormControl>
                    <Input type="date" min={today} {...field} />
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
                    <Input type="time" {...field} />
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
                  rows={6}
                  placeholder="Beskriv gärna vad du vill göra, till exempel klippning, slingor eller skäggtrim."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Vill du boka färg? Beskriv gärna ditt utgångsläge och om du har färgat tidigare.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="consent"
          render={({ field }) => (
            <FormItem className="rounded-2xl border border-border/70 bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(event) => field.onChange(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary"
                />
                <div className="space-y-1">
                  <FormLabel htmlFor="consent" className="cursor-pointer">
                    Jag godkänner att ni kontaktar mig om min bokning.
                  </FormLabel>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Du kan lämna rutan omarkerad om du bara vill skicka in din förfrågan som
                    vanligt.
                  </p>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full transition-all duration-200 active:scale-95 sm:w-auto"
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Skicka bokningsförfrågan
        </Button>
      </form>
    </Form>
  );
}

export default BookingForm;