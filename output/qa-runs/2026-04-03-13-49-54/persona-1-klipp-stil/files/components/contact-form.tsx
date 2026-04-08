"use client";




import { businessInfo } from "@/lib/site";
import { useState } from "react";
import { Mail, MessageSquareText, Phone, User as User2 } from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import ContactFormValues from "@/components/contact-form-values"








const contactSchema = z.object({
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z.string().optional(),
  message: z.string().min(10, "Skriv minst 10 tecken så vi förstår din fråga."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const onSubmit = async () => {
    setIsSubmitting(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    setSubmitted(true);
    form.reset();
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div aria-live="polite">
        {submitted ? (
          <div className="rounded-[1.75rem] border border-accent/30 bg-accent/10 p-5">
            <h3 className="text-2xl font-semibold tracking-tight">Tack för ditt meddelande.</h3>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Vi återkommer så snart vi kan. Om det är bråttom går det alltid bra att ringa {businessInfo.phone}.
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
                <FormDescription>Valfritt, men bra om du vill att vi ringer upp dig.</FormDescription>
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
                  <div className="relative">
                    <MessageSquareText className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
                    <Textarea
                      rows={6}
                      placeholder="Berätta vad du undrar över så hjälper vi dig vidare."
                      className="rounded-xl pl-10"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormDescription>Vi använder dina uppgifter för att svara på din fråga.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="rounded-full px-8" disabled={isSubmitting}>
            {isSubmitting ? "Skickar..." : "Skicka meddelande"}
          </Button>
        </form>
      </Form>
    </div>
  );
}

export default ContactForm;
