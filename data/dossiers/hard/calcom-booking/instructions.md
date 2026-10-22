# When to use

Use for real appointment availability via Cal.com.

# How to integrate

Mount `<BookingCalendar />`; configure the public event path and retain its hosted fallback link.

# UX rules

- Explain duration, format, price and cancellation policy before the calendar so visitors know what they are booking.
- Keep the calendar container at least 680px tall on desktop; the component uses a smaller mobile minimum and lets Cal.com resize its own content.
- Use one booking embed per page. If several services need different event types, give each a dedicated route or a clear service picker before mounting one calendar.
- Let Cal.com own time zones, availability, attendee details, confirmation and reminders. The generated site should not duplicate those states.
- A completed provider flow may show Cal.com's own confirmation. Never add a second success message unless it is driven by the documented `bookingSuccessfulV2` event.

# Avoid

Do not accept full URLs, invent API keys, or fake bookings in demo mode.

# Verification

- With `NEXT_PUBLIC_CALCOM_LINK` missing and with a preview placeholder, the sample calendar renders and every time button opens an honest demo dialog; no request to Cal.com creates a booking.
- With a real public event path, the inline calendar loads, shows the correct event and available times, and the fallback link opens the same event on `cal.com`.
- Complete one booking using a dedicated test event: verify time zone, calendar conflict blocking, confirmation page/email and cancellation/reschedule links.
- Test narrow mobile and desktop widths, keyboard navigation, focus return after the demo dialog, Escape-to-close and reduced-motion/browser privacy settings.
- An invalid path such as a full URL, query string or `../` stays in demo mode and never becomes an iframe/script target.
