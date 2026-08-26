"use client";

import Cal from "@calcom/embed-react";
import { useEffect, useRef, useState } from "react";

export interface BookingCalendarProps {
  title?: string;
  description?: string;
  layout?: "month_view" | "week_view" | "column_view";
  className?: string;
}

const DEMO_DATES = [
  { weekday: "Nästa", date: "Dag 1", label: "Första lediga dagen" },
  { weekday: "Därefter", date: "Dag 2", label: "Andra lediga dagen" },
  { weekday: "Senare", date: "Dag 3", label: "Tredje lediga dagen" },
] as const;
const DEMO_TIMES = ["09:00", "10:30", "13:00", "15:30"] as const;

function normalizeCalLink(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (/^(?:https?:)?\/\//i.test(raw)) return null;

  const normalized = raw.replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    /placeholder|preview_not_real|dummy|changeme|your[_-]/i.test(normalized) ||
    /[?#:%\s]/.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.length > 4) return null;
  if (/^(?:www\.|app\.)?cal\.com$/i.test(segments[0] ?? "")) return null;
  if (
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(segment),
    )
  ) {
    return null;
  }
  return segments.join("/");
}

function DemoBookingCalendar({
  title,
  description,
  className,
}: Required<Pick<BookingCalendarProps, "title" | "description">> &
  Pick<BookingCalendarProps, "className">) {
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
      return;
    }
    setSelectedTime(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!selectedTime) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    closeButtonRef.current?.focus();
  }, [selectedTime]);

  return (
    <section
      aria-label={title}
      className={[
        "border-border bg-background overflow-hidden rounded-2xl border shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="border-border border-b p-5 sm:p-6">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Tidsbokning
        </p>
        <h2 className="text-foreground mt-2 text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{description}</p>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-foreground text-sm font-medium">Välj dag</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMO_DATES.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                aria-pressed={selectedDate === index}
                onClick={() => setSelectedDate(index)}
                className={[
                  "rounded-xl border px-3 py-3 text-center transition-colors",
                  selectedDate === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent",
                ].join(" ")}
              >
                <span className="block text-xs opacity-80">{item.weekday}</span>
                <span className="mt-1 block text-lg font-semibold">{item.date}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-foreground text-sm font-medium">
            Lediga tider · {DEMO_DATES[selectedDate].label}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_TIMES.map((time) => (
              <button
                key={time}
                type="button"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setSelectedTime(time);
                }}
                className="border-border bg-card text-foreground hover:border-primary hover:bg-accent rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        role="note"
        className="border-border bg-muted/50 text-muted-foreground border-t px-5 py-3 text-xs sm:px-6"
      >
        Demoläge — koppla <code>NEXT_PUBLIC_CALCOM_LINK</code> för verklig tillgänglighet och
        bokning.
      </div>

      {selectedTime && (
        <dialog
          ref={dialogRef}
          aria-modal="true"
          aria-labelledby="booking-demo-title"
          className="border-border bg-background m-auto w-full max-w-md rounded-2xl border p-5 shadow-xl backdrop:bg-black/50"
          onClose={() => {
            setSelectedTime(null);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              closeButtonRef.current?.focus();
            }
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const outside =
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom;
            if (outside) closeDialog();
          }}
        >
          <h3 id="booking-demo-title" className="text-foreground text-lg font-semibold">
            Bokning i demoläge
          </h3>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Du valde {DEMO_DATES[selectedDate].label.toLowerCase()} kl. {selectedTime}. Ingen tid
            reserverades och inga uppgifter skickades. Koppla Cal.com för att aktivera riktiga
            bokningar.
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDialog}
            className="bg-primary text-primary-foreground mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90"
          >
            Stäng
          </button>
        </dialog>
      )}
    </section>
  );
}

export function BookingCalendar({
  title = "Boka en tid",
  description = "Välj en tid som passar. Din bokning bekräftas direkt och kan ombokas via bekräftelsemeddelandet.",
  layout = "month_view",
  className,
}: BookingCalendarProps) {
  const calLink = normalizeCalLink(process.env.NEXT_PUBLIC_CALCOM_LINK);
  if (!calLink) {
    return <DemoBookingCalendar title={title} description={description} className={className} />;
  }

  const hostedUrl = `https://cal.com/${calLink}`;
  return (
    <section
      aria-label={title}
      className={[
        "border-border bg-background overflow-hidden rounded-2xl border shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="border-border border-b p-5 sm:p-6">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Tidsbokning
        </p>
        <h2 className="text-foreground mt-2 text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{description}</p>
      </div>
      <div className="min-h-[620px] sm:min-h-[720px]">
        <Cal
          namespace="booking"
          calLink={calLink}
          config={{ layout, theme: "auto", "ui.autoscroll": "false" }}
          style={{ width: "100%", height: "100%", overflow: "auto" }}
        />
      </div>
      <p className="border-border bg-muted/40 text-muted-foreground border-t px-5 py-3 text-xs sm:px-6">
        Om kalendern inte visas kan du{" "}
        <a
          href={hostedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-foreground font-medium underline underline-offset-4"
        >
          boka direkt hos Cal.com
        </a>
        .
      </p>
    </section>
  );
}
