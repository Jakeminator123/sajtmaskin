"use client";


import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";


import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button"
import ContactFormValues from "@/components/contact-form-values"

const contactSchema = z.object({
  name: z
    .string()
    .min(2, "Ange ditt namn så att vi vet vem vi ska återkomma till."),
  email: z
    .string()
    .email("Ange en giltig e-postadress så att vi kan svara dig."),
  phone: z
    .string()
    .min(8, "Ange ett telefonnummer om du vill bli kontaktad snabbt."),
  message: z
    .string()
    .min(20, "Berätta gärna lite mer så att vi kan hjälpa dig på bästa sätt."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const textareaClassName =
  "flex min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ContactForm() {
  const [submittedName, setSubmittedName] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const onSubmit = async (values: ContactFormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmittedName(values.name);
    reset();
  };

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Skicka ett meddelande
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          Har du frågor om storlek, leverans eller skötsel? Skriv till oss så
          återkommer vi vanligtvis inom 1 arbetsdag. Du kan också ringa om det
          är brådskande.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Namn</Label>
            <Input
              id="name"
              aria-invalid={errors.name ? "true" : "false"}
              placeholder="Ditt namn"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              aria-invalid={errors.email ? "true" : "false"}
              placeholder="din@epost.se"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            type="tel"
            aria-invalid={errors.phone ? "true" : "false"}
            placeholder="070-123 45 67"
            {...register("phone")}
          />
          {errors.phone ? (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Meddelande</Label>
          <textarea
            id="message"
            aria-invalid={errors.message ? "true" : "false"}
            placeholder="Berätta gärna vad du undrar över eller vilket smycke du tittar på."
            className={textareaClassName}
            {...register("message")}
          />
          {errors.message ? (
            <p className="text-sm text-destructive">{errors.message.message}</p>
          ) : null}
        </div>

        <p className="text-sm leading-7 text-muted-foreground">
          Genom att skicka formuläret godkänner du att vi använder dina
          uppgifter för att besvara din fråga.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="submit"
            size="lg"
            className="rounded-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Skickar..." : "Skicka meddelande"}
          </Button>

          <div aria-live="polite" className="min-h-6 text-sm">
            {isSubmitSuccessful && submittedName ? (
              <p className="rounded-full bg-muted px-4 py-2 text-foreground">
                Tack {submittedName}, vi återkommer snart.
              </p>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}

export default ContactForm;
