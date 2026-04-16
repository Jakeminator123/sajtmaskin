# Domain Hints
<!-- directive: domain-hints -->
<!-- cascade: explicit > indicated > inferred > default -->

Domain profile is inferred from the user prompt via keyword matching (see `config/domain-rules.json`). When the Brief-LLM provides a `domainProfile` field, that takes precedence over keyword inference.

## Structure Hints by Domain
<!-- default: from-domain-rules -->

### restaurant
- Treat this as a hospitality/restaurant website, not an online store.
- Strong default pages/sections: home, menu, about, contact, booking/reservation, opening hours, FAQ.
- Do not introduce cart, checkout, product catalog, inventory, or payment-provider flows unless the user explicitly asks for online ordering.
- Emphasize atmosphere, food/drink presentation, trust, practical visit information, and clear reservation/contact CTAs.

### hotel
- Treat this as a hospitality/hotel website, not ecommerce.
- Strong default pages/sections: home, rooms, amenities/spa, about, contact, booking, FAQ.
- Focus on stay experience, location, rooms, amenities, and booking journey.

### spa-salon
- Treat this as a service-booking website, not ecommerce.
- Strong default pages/sections: home, services/treatments, about/team, contact, booking, FAQ.
- Focus on treatments/services, trust, staff, ambience, and appointment booking CTAs.

### clinic
- Treat this as a clinic/service website, not ecommerce.
- Strong default pages/sections: home, services, practitioners/team, about, contact, booking/request appointment, FAQ.
- Focus on trust, credentials, patient journey, and practical contact/booking information.

### event-venue
- Treat this as a venue/hospitality website, not ecommerce.
- Strong default pages/sections: home, venue spaces, events/packages, gallery, contact, booking inquiry, FAQ.
- Focus on spaces, atmosphere, booking inquiry, logistics, and social proof.

### ecommerce
- Treat this as a real online store/storefront.
- Strong default pages/sections: home, product/category pages, cart, checkout, trust/returns/shipping information.

### portfolio
- Treat this as a portfolio/showcase site.
- Strong default pages/sections: home, selected work, about, services/contact, case studies or gallery.

### saas
- Treat this as product/saas positioning or app-marketing.
- Strong default pages/sections: home, features, pricing, FAQ, contact/demo CTA.

### agency
- Treat this as an agency/services website.
- Strong default pages/sections: home, services, about/team, case studies/portfolio, contact.

### education
- Treat this as an education/course website.
- Strong default pages/sections: home, courses/programs, about, instructors/team, enrollment/contact, FAQ.

### real-estate
- Treat this as a real estate/property website.
- Strong default pages/sections: home, listings/properties, about, agents/team, contact.

### general
- No domain-specific structure hints. Follow the prompt and brief directly.

## Contract & Backend Hints
<!-- default: from-domain -->

### Hospitality domains (restaurant, hotel, spa-salon, clinic, event-venue)
- Booking/contact keywords in hospitality or service domains do not automatically imply Stripe, checkout, carts, or persisted database contracts.
- If no real backend is explicitly requested, prefer static/reservation-request flows, contact forms, booking CTAs, or external-booking placeholders over local databases and payment providers.

### Ecommerce
- Ecommerce keywords do imply storefront/cart/checkout patterns and may justify payment/provider contracts.
