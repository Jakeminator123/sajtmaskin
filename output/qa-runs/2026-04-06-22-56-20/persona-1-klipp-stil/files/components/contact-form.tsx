"use client";








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
  name: z.string().min(2, "Skriv ditt namn."),
  email: z.string().email("Ange en giltig e-postadress."),
  phone: z
    .string()
    .regex(/^(?:\+46|0)\d[\d -]{7,}$/, "Ange ett giltigt telefonnummer."),
  message: z
    .string()
    .min(10, "Skriv gärna några ord om ditt ärende.")
    .max(700, "Meddelandet får vara högst 700 tecken."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const [submittedName, setSubmittedName] = useState<string | null>(null);

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
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmittedName(values.name);
    form.reset();
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
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

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
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
                    placeholder="Beskriv gärna vad du vill ha hjälp med eller vilken behandling du är intresserad av."
                    className="min-h-40 rounded-2xl"
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
            disabled={form.formState.isSubmitting}
            className="w-full rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95 sm:w-fit"
          >
            {form.formState.isSubmitting ? "Skickar..." : "Skicka"}
          </Button>
        </form>
      </Form>

      <div aria-live="polite">
        {submittedName ? (
          <div className="rounded-[1.75rem] border border-primary/20 bg-primary/5 p-5">
            <p className="text-lg font-semibold">Tack för ditt meddelande, {submittedName}.</p>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Vi har tagit emot din förfrågan och återkommer så snart vi kan med
              svar eller förslag på nästa steg.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ContactForm;
