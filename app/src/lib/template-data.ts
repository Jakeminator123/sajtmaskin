// Category data with quick prompts
// Templates are placeholder for future v0 integration

export interface QuickPrompt {
  label: string;
  prompt: string;
}

export interface CategoryInfo {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  quickPrompts: QuickPrompt[];
}

// Category metadata with rich, detailed quick prompts
export const CATEGORIES: Record<string, CategoryInfo> = {
  "landing-page": {
    id: "landing-page",
    title: "Landing Page",
    description: "Enkla one-pagers för produkter och kampanjer",
    icon: "FileText",
    quickPrompts: [
      {
        label: "Modern SaaS-startup",
        prompt: `Create a premium SaaS landing page with these sections:

**HERO:** Full-screen gradient background (deep purple #1a0a2e to black), floating UI mockup with glassmorphism effect, bold headline "Transform Your Workflow", subtext about productivity, two CTAs (Start Free Trial - gradient purple, Watch Demo - ghost button), trust badges (500+ companies)

**FEATURES:** Bento grid layout (2x3), each feature card has subtle hover animation, icon in colored circle, feature title, 2-line description. Features: AI-Powered Analytics, Real-time Collaboration, Smart Automation, Enterprise Security, Custom Workflows, 24/7 Support

**SOCIAL PROOF:** Logo carousel of tech companies (Apple, Google, Meta, etc style placeholders), animated infinite scroll, grayscale to color on hover

**PRICING:** 3-tier cards (Starter $29, Pro $79 highlighted as "Most Popular", Enterprise Custom), feature lists with checkmarks, monthly/yearly toggle with 20% savings badge

**TESTIMONIALS:** Horizontal scroll carousel, customer photo, quote, name, role, company, star rating

**CTA SECTION:** Gradient background, large headline "Ready to scale?", email input with "Get Started" button, no credit card required text

**FOOTER:** 4-column layout (Product, Company, Resources, Legal), newsletter signup, social icons, copyright

Design: Dark theme (#0a0a0a background), purple (#8b5cf6) and blue (#3b82f6) accents, Inter font, subtle grain texture, smooth scroll, Framer Motion animations`,
      },
      {
        label: "Portfolio för fotograf",
        prompt: `Create an elegant photographer portfolio landing page:

**HERO:** Full-bleed hero image (dark overlay 40%), photographer name in large serif font (Playfair Display), "Visual Storyteller" subtitle, scroll indicator animation, navigation menu in top-right (Home, Work, About, Contact)

**GALLERY MASONRY:** Pinterest-style grid, mix of portrait and landscape images, hover effect shows project name + category, subtle fade-in on scroll, lightbox on click, smooth transitions

**ABOUT:** Split layout - large portrait photo left (60%), text right with bio, equipment list, awards/features (Vogue, Elle, etc), "Download Portfolio PDF" button

**SERVICES:** 3 cards (Editorial $2500, Commercial $5000, Weddings Custom), elegant borders, hover lift effect, "Inquire" buttons

**PROCESS:** Horizontal timeline (4 steps): Discovery Call → Concept & Planning → Photo Session → Delivery, icons for each step, connecting line animation

**INSTAGRAM FEED:** Real-looking grid preview, follow counter, "Follow @photographer" button, 6 recent photos

**CONTACT:** Minimalist form (Name, Email, Project Type dropdown, Message), "Based in Stockholm" with map pin, availability calendar preview, response time "Within 24 hours"

Design: Cream background (#faf7f2), black text, serif headings, sans-serif body, lots of whitespace, image-forward, subtle parallax effects`,
      },
      {
        label: "Produktlansering",
        prompt: `Create a luxury product launch landing page for a premium headphone:

**HERO:** Product floating on gradient background (black to deep blue), 3D rotation effect on scroll, product name "AURA PRO" in bold, tagline "Silence Perfected", pre-order button with countdown timer, "Starting at $499" price badge

**PRODUCT SHOWCASE:** Full-width product image sections that change on scroll, each highlighting: Premium Materials (aluminum, leather), 50-hour Battery, Active Noise Cancellation, Spatial Audio. Parallax text reveals.

**SPECS COMPARISON:** Horizontal scroll comparing to competitors, feature matrix with checkmarks, "Industry Leading" badges, technical specifications in expandable accordion

**EXPERIENCE VIDEO:** Auto-playing muted video background, immersive audio visualization, play full video button opens modal

**COLORS:** Product color picker (Midnight Black, Pearl White, Rose Gold), 360° product view, "Select Your Color" heading

**TESTIMONIALS:** Music producer quotes with headshot, waveform visualizations, "Featured Artist" badges

**FEATURES DEEP-DIVE:** Tabbed interface (Sound, Comfort, Technology), each tab has detailed specs, diagrams, and hero images

**PRE-ORDER CTA:** Sticky bottom bar appears on scroll, "Pre-Order Now - Ships December", limited quantity indicator, Apple Pay/Google Pay icons

**FOOTER:** Newsletter for launch updates, social proof (100k+ pre-orders), legal links

Design: Luxurious dark theme, gold (#d4af37) accents, high contrast, cinematic feel, smooth 60fps animations, WebGL subtle effects`,
      },
      {
        label: "Event/konferens",
        prompt: `Create an energetic tech conference landing page for "FUTURE DEV 2025":

**HERO:** Full-screen video background (code animations, networking), event logo animated, "March 15-17, 2025 • Stockholm", "The Future of Development" tagline, countdown timer (days/hours/min/sec), "Get Tickets" primary CTA, "View Schedule" secondary

**SPEAKERS:** Grid of 12 speaker cards, professional headshots, name, title, company logo, topic tag, "View Talk" button, filter by track (AI, Web3, Cloud, DevOps)

**AGENDA:** 3-day tabbed view, timeline format, session blocks with time, title, speaker, room, track color-coded, "Add to Calendar" buttons, search/filter functionality

**TICKETS:** 3 tiers (Early Bird €299, Regular €499, VIP €999), what's included list, quantity selector, "Almost Sold Out" urgency badge for Early Bird, group discount banner

**VENUE:** Interactive map embed, venue photos gallery, "How to Get There" accordion (flights, trains, parking), nearby hotels with partner rates

**SPONSORS:** Tiered sponsor logos (Platinum/Gold/Silver), "Become a Sponsor" CTA, sponsor benefits hover cards

**WORKSHOPS:** Horizontal scroll cards, hands-on workshop previews, skill level badges, seat limits, separate registration

**PAST HIGHLIGHTS:** Video recap from last year, attendee count stats (2000+ attendees, 50+ talks), photo gallery, "Best Conference Ever" quotes

**REGISTRATION FORM:** Multi-step (Personal Info → Ticket Selection → Payment), progress indicator, promo code field, invoice options

**FAQ:** Accordion style, categories (Tickets, Venue, Content, Logistics), search bar

Design: Electric blue (#0066ff) and neon green (#00ff88) on dark (#0d1117), geometric patterns, energetic gradients, tech aesthetic, micro-interactions throughout`,
      },
    ],
  },
  website: {
    id: "website",
    title: "Hemsida",
    description: "Kompletta flersidiga webbplatser",
    icon: "Globe",
    quickPrompts: [
      {
        label: "Tech-företag",
        prompt: `Create a complete tech company website with multiple pages:

**NAVIGATION:** Sticky header, logo left, menu center (Solutions, Products, About, Resources, Contact), "Get Demo" CTA right, mega-menu for Solutions dropdown, mobile hamburger menu

**HOME PAGE:**
- Hero: Split layout, headline "Build the Future Today", product dashboard mockup with hover interaction, two CTAs
- Trusted by: Logo carousel (20+ enterprise logos)
- Solutions overview: 4 cards with icons and "Learn more" links
- Stats bar: Revenue, Customers, Countries, Uptime %
- Product preview: Tab interface showing different products
- Testimonial slider: Customer quotes with video option
- Latest blog posts: 3 featured articles
- Newsletter CTA: Dark background section

**SOLUTIONS PAGE:**
- Solutions grid: 6 detailed solution cards
- Use cases: Industry-specific tabs
- Integration logos: App marketplace preview
- ROI calculator: Interactive tool
- Case study preview: Featured customer story

**ABOUT PAGE:**
- Company story: Timeline from founding to now
- Mission/Vision/Values: Icon cards
- Team: Leadership headshots with bios
- Office locations: Map with markers
- Careers teaser: Open positions count, culture photos
- Press/Awards: Logo grid and highlights

**CONTACT PAGE:**
- Contact form: Comprehensive fields
- Office addresses: Multiple locations
- Support options: Chat, Email, Phone
- FAQ section: Common questions
- Map embed: Interactive location

**FOOTER:** Multi-column (Products, Solutions, Company, Resources, Legal), social links, language selector, newsletter signup

Design: Professional blue (#0052CC) primary, clean white backgrounds, subtle gradients, modern iconography, smooth page transitions`,
      },
      {
        label: "Restaurang med meny",
        prompt: `Create a warm restaurant website for "SÖDER BISTRO":

**NAVIGATION:** Semi-transparent header, centered logo, navigation (Meny, Om Oss, Galleri, Boka Bord, Kontakt), "Reservera" floating button

**HOME PAGE:**
- Hero: Full-screen food photography video, restaurant name in elegant script, "Est. 2010 • Stockholm", "Se Menyn" and "Boka Bord" buttons
- Welcome section: Chef's message with signature, restaurant interior photo
- Featured dishes: 3 signature dishes with images, description, price
- Today's special: Highlighted daily dish with timer
- Atmosphere: Photo grid of interior, terrace, bar
- Google reviews: 4.8 stars, recent reviews carousel
- Opening hours: Elegant display with next opening countdown
- Location preview: Map with "Hitta hit" link

**MENY PAGE:**
- Menu categories: Tab/section navigation (Förrätter, Varmrätter, Desserter, Drycker)
- Dish cards: Photo, name, description, dietary icons (vegan, gluten-free), price
- Wine list: Separate elegant section
- Chef's recommendations: Highlighted with badge
- Seasonal menu: Special section with date range

**OM OSS PAGE:**
- Restaurant story: Timeline with photos
- Meet the team: Chef, sommelier, staff photos
- Our philosophy: Farm-to-table, local suppliers
- Awards & press: Magazine features, ratings
- Virtual tour: 360° embedded view

**GALLERI PAGE:**
- Masonry gallery: Food, interior, events, behind-the-scenes
- Category filters: All, Mat, Interiör, Events
- Instagram feed integration

**BOKA BORD PAGE:**
- Reservation form: Date picker, time slots, party size, special requests
- Private events: Inquiry section for groups
- Gift cards: Purchase option
- Cancellation policy

**KONTAKT PAGE:**
- Contact details: Phone, email, address
- Map with directions
- Contact form: Feedback and inquiries
- Social media links

Design: Warm burgundy (#722F37), cream (#F5F1E6), gold accents (#C5A572), elegant serif headings (Cormorant), cozy and inviting atmosphere, food photography focus`,
      },
      {
        label: "Konsultbyrå",
        prompt: `Create a professional consulting firm website for "NEXUS ADVISORY":

**NAVIGATION:** Clean white header, logo left, menu (Tjänster, Om Oss, Team, Case Studies, Insikter, Kontakt), "Boka Möte" CTA

**HOME PAGE:**
- Hero: Abstract geometric background, "Strategic Solutions for Tomorrow's Leaders", client logos bar, "Upptäck mer" scroll indicator
- Services preview: 4 key services with icons and links
- Differentiators: 3-column "Why Choose Us" section
- Featured case study: Large image, results metrics, "Läs mer" link
- Client testimonials: CEO quotes with company logos
- Thought leadership: Latest 3 insights/articles
- CTA section: "Ready to Transform?" with contact form preview

**TJÄNSTER PAGE:**
- Services grid: 6 detailed service pages
- Each service: Hero, description, methodology, deliverables, related case studies
- Process timeline: Discovery → Analysis → Strategy → Implementation
- Service comparison: Feature matrix

**OM OSS PAGE:**
- Firm overview: History, values, culture
- Global presence: Office locations map
- By the numbers: Years, projects, industries, countries
- Awards and recognition: Certification badges
- Partners: Technology and industry partnerships

**TEAM PAGE:**
- Leadership: Partner headshots, bios, LinkedIn
- Expertise areas: Filter by specialty
- Join us: Career opportunities teaser

**CASE STUDIES PAGE:**
- Filterable grid: Industry, service, year
- Case study template: Challenge, Solution, Results, Metrics, Client quote
- Featured case: Detailed deep-dive
- Results dashboard: Aggregated impact metrics

**INSIKTER PAGE:**
- Blog/articles: Grid with featured image, title, date, category
- Reports: Downloadable whitepapers (gated)
- Webinars: Upcoming and recorded
- Newsletter signup

**KONTAKT PAGE:**
- Contact form: Inquiry type, company, message
- Office locations: Multiple addresses with maps
- Direct contacts: Partners for specific inquiries
- FAQ: Common questions

Design: Navy blue (#1B365D), white backgrounds, gold (#B8860B) accents, serif headings (Merriweather), professional photography, subtle animations`,
      },
      {
        label: "Ideell organisation",
        prompt: `Create an inspiring nonprofit website for "FRAMTID FÖR ALLA" (Future for All):

**NAVIGATION:** Transparent header becoming solid on scroll, logo, menu (Vårt Arbete, Om Oss, Engagera Dig, Nyheter, Kontakt), prominent "Donera Nu" button in coral color

**HOME PAGE:**
- Hero: Emotional full-screen image of impact, "Together We Create Change", impact counter animation (10,000+ lives impacted), "Gör en Skillnad" CTA
- Mission statement: Bold quote, founder signature
- Focus areas: 3 program cards (Education, Health, Environment) with images
- Impact metrics: Animated counters (Projects, Countries, Volunteers, Years)
- Current campaign: Featured campaign with progress bar and goal
- Stories: Beneficiary story carousel with photos and videos
- Partners and supporters: Logo grid
- Latest news: 3 recent updates
- Ways to help: Donate, Volunteer, Spread the Word cards

**VÅRT ARBETE PAGE:**
- Programs overview: Detailed cards for each focus area
- Project map: Interactive map with project locations
- Success stories: Case studies with before/after
- Annual report: Download and key highlights
- Methodology: Our approach explained

**OM OSS PAGE:**
- Our story: Timeline from founding to now
- Vision, Mission, Values: Icon-based presentation
- Team: Staff and board members
- Financials: Transparency section, pie charts of fund allocation
- Partnerships: Organizations we work with

**ENGAGERA DIG PAGE:**
- Donate: Multiple options (one-time, monthly, corporate)
- Volunteer: Application form, volunteer stories
- Fundraise: Start your own campaign
- Corporate: Partnership opportunities
- Events: Upcoming events calendar

**NYHETER PAGE:**
- Blog and updates: Filterable by program
- Press releases: Media kit download
- Newsletter archive
- Social media feed

**KONTAKT PAGE:**
- Contact form: General inquiries
- Office location: Map and address
- Department contacts: Specific teams
- Press inquiries: Media contact

Design: Coral (#FF6B6B) primary, teal (#20B2AA) secondary, warm white background, friendly rounded fonts, authentic photography, emotional and hopeful tone, accessibility-first`,
      },
    ],
  },
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler och datavisualisering",
    icon: "LayoutDashboard",
    quickPrompts: [
      {
        label: "Försäljningsstatistik",
        prompt: `Create a comprehensive sales analytics dashboard:

**LAYOUT:** Sidebar navigation (collapsed by default), top header with search, notifications, profile

**SIDEBAR:** Logo, Dashboard, Orders, Customers, Products, Analytics, Reports, Settings icons with labels on hover

**HEADER:** Search bar, notification bell (3 unread), user avatar dropdown, dark mode toggle

**MAIN DASHBOARD:**

**Row 1 - KPI Cards (4 columns):**
- Total Revenue: $124,500 (+12.5% vs last month, green arrow)
- Orders: 1,247 (-3.2%, red arrow)  
- Customers: 8,492 (+8.1%, green)
- Avg Order Value: $99.80 (+15.3%, green)
Each card: Icon, metric, change %, sparkline mini-chart

**Row 2 - Charts:**
- Revenue Over Time (60% width): Line chart, 12 months, actual vs target lines, hover tooltips, zoom controls
- Revenue by Category (40%): Donut chart, 5 categories with legend, center total

**Row 3:**
- Top Products (50%): Horizontal bar chart, top 10 products, sales count
- Sales by Region (50%): Interactive map with heat intensity, hover for details

**Row 4:**
- Recent Orders Table: Columns (Order ID, Customer, Products, Total, Status, Date), sortable, status badges (Completed/Pending/Shipped), pagination, "View All" link
- Sales Team Leaderboard: Avatar, name, sales count, revenue, progress bar to target

**Row 5:**
- Customer Acquisition: Funnel chart (Visitors → Leads → Customers)
- Revenue Forecast: Area chart with prediction bands

**FILTERS:** Date range picker (preset: Today, This Week, This Month, Custom), Compare to previous period checkbox

Design: Dark theme (#1a1a2e background, #16213e cards), purple (#7c3aed) accent, Inter font, subtle shadows, smooth transitions, Recharts or Chart.js style`,
      },
      {
        label: "Projekthantering",
        prompt: `Create a modern project management dashboard like Asana/Monday:

**LAYOUT:** Left sidebar (collapsible), main content area, optional right panel for details

**SIDEBAR:**
- Workspace switcher dropdown
- Navigation: Home, My Tasks, Inbox, Reporting
- Favorites section: Pinned projects
- Projects section: Expandable folders, project list with colored dots
- Teams section: Team avatars and names
- Create button: New project/task

**HEADER:** Project name and emoji, view switcher (List/Board/Timeline/Calendar), share button, project settings

**BOARD VIEW (Default):**
- Kanban columns: To Do, In Progress, Review, Done
- Column headers: Task count, add task button, collapse button
- Task cards: Title, assignee avatar, due date, priority flag, tag chips, subtask progress bar, comment count
- Drag and drop between columns
- "Add another column" button

**LIST VIEW:**
- Grouped by status or assignee
- Expandable rows with subtasks
- Inline editing
- Bulk actions toolbar

**TIMELINE VIEW:**
- Gantt-style chart
- Task bars with dependencies
- Zoom controls (Day/Week/Month)
- Today marker line

**RIGHT PANEL (Task Details):**
- Task title (editable)
- Assignee selector
- Due date picker
- Priority dropdown
- Description rich text editor
- Subtasks checklist
- Comments thread with mentions
- Activity log
- File attachments

**QUICK ADD:** Floating "+" button, modal with task form

**NOTIFICATIONS:** Real-time updates, toast notifications

Design: Light theme with colorful accents, smooth animations, rounded corners, Slack-like UI, real-time collaborative feel`,
      },
      {
        label: "Analytics-panel",
        prompt: `Create a Google Analytics-style web analytics dashboard:

**LAYOUT:** Sidebar navigation, header with property selector, main content with customizable date range

**SIDEBAR:** Home, Reports (Realtime, Acquisition, Engagement, Monetization, Retention), Explore, Advertising, Configure

**HEADER:** Property/website selector, date range picker with compare option, share/export buttons

**REALTIME SECTION:**
- Active users now: Large animated counter
- Users by location: World map with dots
- Top pages right now: Live list updating
- Events per minute: Line chart
- Active users by device: Pie chart

**OVERVIEW DASHBOARD:**

**Row 1 - Key Metrics:**
- Users (28-day): 45,231 (+15.2%)
- Sessions: 89,432 (+8.7%)
- Bounce Rate: 42.3% (-2.1%)
- Session Duration: 3m 24s (+12.5%)
Trend sparklines under each

**Row 2:**
- Users Over Time (70%): Area chart with comparison toggle
- New vs Returning Users (30%): Stacked bar chart

**Row 3:**
- Acquisition Channels: Bar chart (Organic, Paid, Direct, Social, Referral, Email)
- Traffic Sources: Table with sessions, conversion rate, revenue

**Row 4:**
- Top Pages: Table with pageviews, unique views, avg time, exit rate
- User Demographics: Age and gender breakdown charts

**Row 5:**
- Device Categories: Pie chart (Desktop/Mobile/Tablet)
- Browser/OS breakdown: Horizontal bars
- Geographic: Top countries table with flags

**Row 6:**
- Events: Top events table with count and value
- Conversions: Goal completions funnel

**CUSTOM REPORTS:** Build your own report builder interface

Design: Clean white background, Google blue (#4285F4) accent, Material Design inspired, data-dense but readable, subtle borders, metric cards with trend indicators`,
      },
      {
        label: "CRM-översikt",
        prompt: `Create a professional CRM dashboard for B2B sales:

**LAYOUT:** Left sidebar, header with global search, main dashboard, activity feed panel

**SIDEBAR:**
- Logo
- Dashboard (Home)
- Contacts
- Companies
- Deals (with value badge)
- Tasks
- Calendar
- Reports
- Settings
- Collapsed: Notifications, Profile

**HEADER:** Global search bar, "Create" button (dropdown: Contact, Company, Deal, Task), notification bell, calendar icon, user profile

**MAIN DASHBOARD:**

**Row 1 - Sales Pipeline:**
- Full-width Kanban/funnel view
- Stages: Lead → Qualified → Proposal → Negotiation → Won/Lost
- Each stage: Count, total value, cards preview
- Deal cards: Company logo, deal name, value, owner avatar, close date, health indicator

**Row 2 - Key Metrics:**
- Revenue This Month: $234,500 (78% of target, progress bar)
- Deals Closed: 23 (+5 vs last month)
- Avg Deal Size: $10,200
- Win Rate: 34%
- Forecast: $450,000 (next 30 days)

**Row 3:**
- Revenue Forecast (60%): Line chart with won, weighted pipeline, best case
- Activity Summary (40%): Calls, emails, meetings counts with trends

**Row 4:**
- My Tasks: Today's tasks list with checkboxes, priority, related contact
- Upcoming Meetings: Calendar preview with meeting details

**Row 5:**
- Top Deals: Table with deal name, company, value, stage, probability, close date, owner
- At-Risk Deals: Deals past due or stalled, health score indicator

**Row 6:**
- Recent Activity: Timeline of all CRM activity (created, updated, won, lost)
- Leaderboard: Sales reps ranked by revenue, deal count

**QUICK ACTIONS:** 
- Log call, Send email, Schedule meeting, Create task floating buttons

**RIGHT PANEL (expandable):**
- Contact/Deal quick view
- Activity timeline
- Notes
- Related items

Design: Professional dark sidebar (#1f2937), white content area, emerald (#10B981) for wins, blue (#3B82F6) primary, modern SaaS aesthetic, Salesforce-inspired`,
      },
    ],
  },
};

// Components that can be added to any project (used in builder)
export const COMPONENTS: QuickPrompt[] = [
  {
    label: "Header/Navigation",
    prompt: "Lägg till en modern header med logotyp, navigation och CTA-knapp.",
  },
  {
    label: "Footer",
    prompt:
      "Lägg till en footer med länkar, sociala medier-ikoner och copyright.",
  },
  {
    label: "Pricing Table",
    prompt: "Lägg till en pricing-sektion med 3 prisplaner och features-lista.",
  },
  {
    label: "Contact Form",
    prompt:
      "Lägg till ett kontaktformulär med namn, email, meddelande och skicka-knapp.",
  },
  {
    label: "Testimonials",
    prompt:
      "Lägg till en testimonials-sektion med kundcitat, bilder och företagsnamn.",
  },
  {
    label: "FAQ Accordion",
    prompt:
      "Lägg till en FAQ-sektion med expanderbara frågor och svar i accordion-stil.",
  },
  {
    label: "Feature Grid",
    prompt:
      "Lägg till en feature-sektion med ikoner, rubriker och beskrivningar i ett grid.",
  },
  {
    label: "Newsletter Signup",
    prompt:
      "Lägg till en newsletter-sektion med email-input och prenumerera-knapp.",
  },
  {
    label: "Hero Section",
    prompt:
      "Lägg till en hero-sektion med stor rubrik, beskrivning och CTA-knappar.",
  },
  {
    label: "Image Gallery",
    prompt:
      "Lägg till ett bildgalleri med hover-effekter och lightbox-funktionalitet.",
  },
];

// Get all category IDs
export const CATEGORY_IDS = Object.keys(CATEGORIES);

// Get category by ID
export function getCategory(id: string): CategoryInfo | undefined {
  return CATEGORIES[id];
}

// Get quick prompts for a category
export function getQuickPromptsForCategory(categoryId: string): QuickPrompt[] {
  return CATEGORIES[categoryId]?.quickPrompts || [];
}

// Category titles in Swedish for display
export const CATEGORY_TITLES: Record<string, string> = {
  "landing-page": "Landing Page",
  website: "Hemsida",
  dashboard: "Dashboard",
};
