# When to use

- The brief declares `booking`: visitors need to reserve an appointment against real availability, for example a consultation, treatment, class or service slot.
- Use Cal.com when hosted scheduling, time-zone conversion, availability rules, reminders and confirmation should be owned by a booking provider instead of rebuilt in the generated site.
- Do not use it for hotel rooms, restaurant tables, equipment inventory or multi-resource reservations. Those need domain-specific availability and capacity, not an appointment embed.
- A decorative date picker, a “Boka” CTA that links elsewhere, or a booking-request contact form is ordinary page UI and should not trigger this dossier.

# How to integrate

1. Install `@calcom/embed-react` and emit `components/booking-calendar.tsx` verbatim. Its event-link validation and visual demo gate are load-bearing.
2. Add `NEXT_PUBLIC_CALCOM_LINK` through Byggblock. Store only the public path after `cal.com/`, such as `anna/30min` or `team/acme/intro`; never store a full URL, query string or secret.
3. Mount `<BookingCalendar />` on the dedicated booking route or beside the service details. Adapt `title`, `description`, `layout` and surrounding layout props; do not fork the provider/config guard.
4. In Cal.com, create and enable the event type, connect the owner's calendar, set availability/time zone, and copy the event's public embed path.
5. Keep an ordinary link to the hosted Cal.com page below the embed. It is the recovery path if browser privacy settings or a content blocker prevents the inline script from loading.

# UX rules

- Explain duration, format, price and cancellation policy before the calendar so visitors know what they are booking.
- Keep the calendar container at least 680px tall on desktop; the component uses a smaller mobile minimum and lets Cal.com resize its own content.
- Use one booking embed per page. If several services need different event types, give each a dedicated route or a clear service picker before mounting one calendar.
- Let Cal.com own time zones, availability, attendee details, confirmation and reminders. The generated site should not duplicate those states.
- A completed provider flow may show Cal.com's own confirmation. Never add a second success message unless it is driven by the documented `bookingSuccessfulV2` event.

# Avoid

- Do not call Cal.com's private API or invent API keys for this embed. `NEXT_PUBLIC_CALCOM_LINK` is the only dossier config and is intentionally public.
- Do not accept arbitrary origins or full URLs from config. The verbatim component only permits a safe Cal.com path and always builds the provider URL itself.
- Do not fake a booking, reserve a local slot, send email or persist attendee data in demo mode. A demo click only opens the explicit “ingen bokning skapades” dialog.
- Do not use this appointment dossier for room/table inventory, waitlists, seat counts or payments.
- Do not remove the fallback link or replace the official React embed with an unbounded iframe.

# Verification

- With `NEXT_PUBLIC_CALCOM_LINK` missing and with a preview placeholder, the sample calendar renders and every time button opens an honest demo dialog; no request to Cal.com creates a booking.
- With a real public event path, the inline calendar loads, shows the correct event and available times, and the fallback link opens the same event on `cal.com`.
- Complete one booking using a dedicated test event: verify time zone, calendar conflict blocking, confirmation page/email and cancellation/reschedule links.
- Test narrow mobile and desktop widths, keyboard navigation, focus return after the demo dialog, Escape-to-close and reduced-motion/browser privacy settings.
- An invalid path such as a full URL, query string or `../` stays in demo mode and never becomes an iframe/script target.
