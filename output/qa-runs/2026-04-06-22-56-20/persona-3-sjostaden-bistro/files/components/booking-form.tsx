"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button"
import BookingFormValues from "@/components/booking-form-values"

const bookingSchema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .min(8, "Ange ett giltigt telefonnummer.")
    .regex(/^[0-9+\-\s]+$/, "Telefonnumret får bara innehålla siffror, mellanslag och bindestreck."),
  date: z.string().min(1, "Välj ett datum."),
  time: z.string().min(1, "Välj en tid."),
  message: z
    .string()
    .min(10, "Skriv gärna några ord om ditt sällskap.")
    .max(500, "Meddelandet får vara högst 500 tecken."),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export function BookingForm() {
  const [confirmation, setConfirmation] = useState<string>("");

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

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

  const onSubmit = (values: BookingFormValues) => {
    setConfirmation(
      `Tack ${values.name}. Din bokningsförfrågan för ${values.date} klockan ${values.time} har skickats. Vi återkommer snarast via e-post eller telefon.`,
    );
    form.reset();
  };

  return (
    <div className="rounded-[1.75rem] border border-border bg-card/95 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-full bg-primary/15 p-2 text-primary">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Skicka bokningsförfrågan</h2>
          <p className="text-sm text-muted-foreground">
            Vi bekräftar normalt inom två timmar under öppettid.
          </p>
        </div>
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
                    <Input placeholder="Anna Svensson" {...field} />
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
                    <Input type="email" placeholder="anna@exempel.se" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem className="sm:col-span-1">
                  <FormLabel>Telefonnummer</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="070-123 45 67" {...field} />
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

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meddelande</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Berätta gärna om antal gäster, allergier eller om ni firar något särskilt."
                    className="min-h-32 resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="w-full rounded-full active:scale-95">
            Skicka bokningsförfrågan
          </Button>

          <div aria-live="polite" className="min-h-10">
            {confirmation ? (
              <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>{confirmation}</p>
              </div>
            ) : null}
          </div>
        </form>
      </Form>
    </div>
  );
}

export default BookingForm;
