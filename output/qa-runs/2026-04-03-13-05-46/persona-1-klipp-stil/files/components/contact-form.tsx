"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import ContactFormValues from "@/components/contact-form-values"

const contactSchema = z.object({
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .regex(
      /^[0-9+\-\s]*$/,
      "Telefonnumret får bara innehålla siffror, mellanslag, plus och bindestreck.",
    )
    .optional()
    .or(z.literal("")),
  message: z.string().min(10, "Berätta lite mer så att vi kan hjälpa dig på bästa sätt."),
  website: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      website: "",
    },
  });

  function onSubmit(values: ContactFormValues) {
    if (values.website) {
      return;
    }

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
              <h2 className="text-2xl font-semibold">Tack! Vi återkommer så snart vi kan.</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Vi läser igenom ditt meddelande och svarar via e-post eller telefon. Om din fråga
                gäller en tid samma dag går det snabbast att ringa oss på 031-123 45 67.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full transition-all duration-200 active:scale-95"
              onClick={() => {
                setSubmitted(false);
                form.reset();
              }}
            >
              Skicka ett nytt meddelande
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
          {...form.register("website")}
        />

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

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Meddelande</FormLabel>
              <FormControl>
                <Textarea
                  rows={6}
                  placeholder="Berätta gärna vad du undrar över, vilken tjänst du är intresserad av eller hur vi kan hjälpa dig."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full transition-all duration-200 active:scale-95 sm:w-auto"
        >
          <Send className="mr-2 h-4 w-4" />
          Skicka meddelande
        </Button>
      </form>
    </Form>
  );
}

export default ContactForm;