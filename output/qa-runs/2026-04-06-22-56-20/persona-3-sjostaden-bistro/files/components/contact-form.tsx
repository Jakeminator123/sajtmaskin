"use client";


import { CheckCircle2, Mail } from "lucide-react";





import {
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import ContactFormValues from "@/components/contact-form-values"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";



const contactSchema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .min(8, "Ange ett giltigt telefonnummer.")
    .regex(/^[0-9+\-\s]+$/, "Telefonnumret får bara innehålla siffror, mellanslag och bindestreck."),
  message: z
    .string()
    .min(10, "Skriv ett meddelande.")
    .max(600, "Meddelandet får vara högst 600 tecken."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [confirmation, setConfirmation] = useState<string>("");

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const onSubmit = (values: ContactFormValues) => {
    setConfirmation(
      `Tack ${values.name}. Ditt meddelande har skickats till Sjöstaden Bistro. Vi återkommer så snart vi kan under våra öppettider.`,
    );
    form.reset();
  };

  return (
    <div className="rounded-[1.75rem] border border-border bg-card/95 p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-full bg-primary/15 p-2 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Kontakta oss</h2>
          <p className="text-sm text-muted-foreground">
            Skicka en fråga om bokning, catering eller samarbeten.
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

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
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
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meddelande</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Berätta vad du behöver hjälp med, till exempel catering, större sällskap eller en vanlig bokningsfråga."
                    className="min-h-36 resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="w-full rounded-full active:scale-95">
            Skicka meddelande
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

export default ContactForm;
