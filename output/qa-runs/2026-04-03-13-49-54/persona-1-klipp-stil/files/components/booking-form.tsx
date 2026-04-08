"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";
import { CalendarDays, Clock3, Mail, Phone, User as User2 } from "lucide-react";
import { z } from "zod";


import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bookingTimes, businessInfo } from "@/lib/site";
import { Button } from "@/components/ui/button"
import SubmittedBooking from "@/components/submitted-booking"
import BookingFormValues from "@/components/booking-form-values"

const bookingSchema = z.object({
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z.string().min(6, "Ange ett telefonnummer."),
  date: z.string().min(1, "Välj ett datum."),
  time: z.string().min(1, "Välj en tid."),
  message: z.string().max(600, "Meddelandet får vara högst 600 tecken.").optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

type SubmittedBooking = {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  message?: string;
};

function formatDateSv(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function BookingForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedBooking, setSubmittedBooking] = useState<SubmittedBooking | null>(null);

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

  const onSubmit = async (values: BookingFormValues) => {
    setIsSubmitting(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 800);
    });

    setSubmittedBooking(values);
    form.reset();
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div aria-live="polite">
        {submittedBooking ? (
          <div className="rounded-[1.75rem] border border-accent/30 bg-accent/10 p-6">
            <h3 className="text-2xl font-semibold tracking-tight">Tack! Vi har tagit emot din bokningsförfrågan.</h3>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Vi återkommer med en bekräftelse inom kort. Håll utkik i din e-post, och kontrollera gärna skräpposten om du inte
              ser något meddelande.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] bg-background/80 p-4">
                <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Vald tid</p>
                <p className="mt-2 font-medium">
                  {formatDateSv(submittedBooking.date)} kl. {submittedBooking.time}
                </p>
              </div>
              <div className="rounded-[1.25rem] bg-background/80 p-4">
                <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Kontaktuppgifter</p>
                <p className="mt-2 font-medium">{submittedBooking.name}</p>
                <p className="text-sm text-muted-foreground">
                  {submittedBooking.email} • {submittedBooking.phone}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Vid brådskande ärenden, ring {businessInfo.phone}. Om du är osäker på behandling hjälper vi dig att justera upplägget
              innan besöket.
            </p>
          </div>
        ) : null}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Namn</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Ditt namn" className="h-12 rounded-xl pl-10" {...field} />
                    </div>
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
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input type="email" placeholder="din@epost.se" className="h-12 rounded-xl pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefon</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="070-123 45 67" className="h-12 rounded-xl pl-10" {...field} />
                    </div>
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
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input type="date" className="h-12 rounded-xl pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tid</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Välj tid" />
                      </div>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bookingTimes.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Avbokning senast 24 timmar innan.</FormDescription>
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
                  <Textarea
                    rows={6}
                    placeholder="Berätta gärna om du vill boka klipp, slingor, skägg eller om du har en inspirationsbild."
                    className="rounded-xl"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Skriv gärna vad du vill göra så hjälper vi dig rätt om du är osäker på behandling eller tidslängd.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">
              Genom att skicka formuläret godkänner du att vi använder dina uppgifter för att återkomma om din bokning.
            </p>
            <Button type="submit" size="lg" className="rounded-full px-8" disabled={isSubmitting}>
              {isSubmitting ? "Skickar..." : "Boka tid"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default BookingForm;
