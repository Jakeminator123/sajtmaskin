"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";


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
import { services } from "@/lib/site-data";
import { Button } from "@/components/ui/button"
import BookingFormValues from "@/components/booking-form-values"

const bookingSchema = z.object({
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .regex(/^(?:\+46|0)\d[\d -]{7,}$/, "Ange ett giltigt telefonnummer."),
  service: z.string().min(1, "Välj en behandling."),
  date: z.string().min(1, "Välj ett datum."),
  time: z.string().min(1, "Välj en tid."),
  message: z
    .string()
    .max(500, "Meddelandet får vara högst 500 tecken.")
    .optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function BookingForm() {
  const [submitted, setSubmitted] = useState<BookingFormValues | null>(null);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      service: "",
      date: "",
      time: "",
      message: "",
    },
  });

  const today = new Date().toISOString().split("T")[0];

  async function onSubmit(values: BookingFormValues) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitted(values);
    form.reset();
  }

  const selectedService = submitted
    ? services.find((service) => service.name === submitted.service)
    : null;

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-5 sm:grid-cols-2"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ditt namn</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Anna Svensson"
                    className="h-11 rounded-xl"
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
                <FormLabel>Telefonnummer</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="070-123 45 67"
                    className="h-11 rounded-xl"
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
              <FormItem className="sm:col-span-2">
                <FormLabel>E-postadress</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="anna@epost.se"
                    className="h-11 rounded-xl"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="service"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Behandling</FormLabel>
                <FormControl>
                  <select className={selectClassName} {...field}>
                    <option value="">Välj behandling</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Datum</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={today}
                    className="h-11 rounded-xl"
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
                  <Input type="time" className="h-11 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Meddelande</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    placeholder="Berätta gärna om du vill boka en större förändring, är osäker på behandling eller har önskemål kring tid."
                    className="min-h-36 rounded-2xl"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="sm:col-span-2">
            <Button
              type="submit"
              size="lg"
              disabled={form.formState.isSubmitting}
              className="rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
            >
              {form.formState.isSubmitting
                ? "Skickar bokningsförfrågan..."
                : "Skicka bokningsförfrågan"}
            </Button>
          </div>
        </form>
      </Form>

      <div aria-live="polite">
        {submitted ? (
          <div className="rounded-[1.75rem] border border-primary/20 bg-primary/5 p-5">
            <p className="text-lg font-semibold">Tack för din bokning, {submitted.name}.</p>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Vi har tagit emot din förfrågan om{" "}
              <span className="font-medium text-foreground">
                {selectedService?.name ?? submitted.service}
              </span>{" "}
              den {submitted.date} klockan {submitted.time}. Vi återkommer via
              e-post eller telefon med en bekräftelse så snart vi har matchat din
              tid med rätt stylist.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default BookingForm;
