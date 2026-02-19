// Category data with quick prompts
// V0 Templates integration

import templatesData from "./templates.json";
import templateCategoriesData from "./template-categories.json";

// Build reverse lookup: templateId -> category
const templateCategoryMapping: Record<string, string> = {};
for (const [category, templateIds] of Object.entries(templateCategoriesData)) {
  if (category.startsWith("_")) continue; // Skip metadata fields
  for (const id of templateIds as string[]) {
    templateCategoryMapping[id] = category;
  }
}

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

// Template interface for v0.app templates
export interface Template {
  id: string;
  title: string;
  slug: string;
  viewUrl: string;
  editUrl: string;
  imageFilename: string;
  previewImageUrl: string; // External URL from Vercel Blob
  category: string;
}

// Import and normalize templates from JSON
// Filter out category placeholder templates that are not real v0 templates
const rawTemplates = (
  templatesData as Array<{
    id: string;
    title: string;
    slug: string;
    view_url: string;
    edit_url: string;
    image_filename: string;
    preview_image_url: string;
    category: string;
  }>
).filter((t) => t.slug !== "categories" && t.id !== "categories");

export const TEMPLATES: Template[] = rawTemplates.map((t) => ({
  id: t.id,
  title: t.title || t.id,
  slug: t.slug,
  viewUrl: t.view_url,
  editUrl: t.edit_url,
  imageFilename: t.image_filename,
  previewImageUrl: t.preview_image_url,
  category: t.category,
}));

// Map template slugs/IDs to category IDs
function getTemplateCategoryId(template: Template): string {
  // Category slugs that are actual categories (not templates)
  const categorySlugs = [
    "ai",
    "animations",
    "components",
    "login-and-sign-up",
    "portfolio",
    "design-systems",
    "layouts",
    "website-templates",
    "apps-and-games",
    "categories",
    "templates",
  ];

  // Skip category templates themselves
  if (categorySlugs.includes(template.slug)) {
    return "website-templates"; // Don't show category cards as templates
  }

  // PRIORITY 1: Check manual category mapping (from template-categories.json)
  // This overrides all other categorization methods
  const mappedCategory = templateCategoryMapping[template.id];
  if (mappedCategory) {
    return mappedCategory;
  }

  // Available V0 categories to distribute templates across
  const availableCategories = [
    "ai",
    "animations",
    "components",
    "login-and-sign-up",
    "blog-and-portfolio",
    "design-systems",
    "layouts",
    "website-templates",
    "apps-and-games",
    "uncategorized", // New fallback category
  ];

  // PRIORITY 2: If template has a specific category in its data, use it
  if (template.category && template.category !== "Templates") {
    const normalizedCategory = template.category.toLowerCase().replace(/\s+/g, "-");
    if (availableCategories.includes(normalizedCategory)) {
      return normalizedCategory;
    }
  }

  // PRIORITY 3: Return "uncategorized" instead of random hash distribution
  // This prevents templates from appearing in wrong categories
  return "uncategorized";
}

// V0.app category metadata
export const V0_CATEGORIES: Record<string, CategoryInfo> = {
  ai: {
    id: "ai",
    title: "AI",
    description: "AI-powered templates och komponenter",
    icon: "Wand2",
    quickPrompts: [],
  },
  animations: {
    id: "animations",
    title: "Animations",
    description: "Animerade komponenter och effekter",
    icon: "Zap",
    quickPrompts: [],
  },
  components: {
    id: "components",
    title: "Components",
    description: "Återanvändbara UI-komponenter",
    icon: "Puzzle",
    quickPrompts: [],
  },
  "login-and-sign-up": {
    id: "login-and-sign-up",
    title: "Login & Sign Up",
    description: "Inloggnings- och registreringsformulär",
    icon: "Lock",
    quickPrompts: [],
  },
  "blog-and-portfolio": {
    id: "blog-and-portfolio",
    title: "Blog & Portfolio",
    description: "Bloggar och portfoliowebbplatser",
    icon: "FileText",
    quickPrompts: [],
  },
  "design-systems": {
    id: "design-systems",
    title: "Design Systems",
    description: "Designsystem och komponentbibliotek",
    icon: "Palette",
    quickPrompts: [],
  },
  layouts: {
    id: "layouts",
    title: "Layouts",
    description: "Sidlayouter och strukturer",
    icon: "Layout",
    quickPrompts: [],
  },
  "website-templates": {
    id: "website-templates",
    title: "Website Templates",
    description: "Kompletta webbplatstemplates",
    icon: "Globe",
    quickPrompts: [],
  },
  "apps-and-games": {
    id: "apps-and-games",
    title: "Apps & Games",
    description: "Applikationer och spel",
    icon: "Gamepad2",
    quickPrompts: [],
  },
  uncategorized: {
    id: "uncategorized",
    title: "Okategoriserade",
    description: "Templates som ännu inte kategoriserats",
    icon: "HelpCircle",
    quickPrompts: [],
  },
};

// Legacy category metadata with rich, detailed quick prompts (kept for AI generation)
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

// Component categories for better organization
export interface ComponentCategory {
  name: string;
  components: QuickPrompt[];
}

// Components that can be added to any project (used in builder)
// Organized by category: Basic → Advanced
export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  {
    name: "🎯 Essential",
    components: [
      {
        label: "Hero Section",
        prompt:
          "Add a hero section with large headline, subheadline, description, CTA buttons (primary + secondary), and optional background image with dark overlay.",
      },
      {
        label: "Header/Navigation",
        prompt:
          "Add a sticky header with logo, navigation menu (Home, About, Services, Contact), mobile hamburger menu, and CTA button. Transparent initially, solid background on scroll.",
      },
      {
        label: "Footer",
        prompt:
          "Add a footer with 4-column layout (Company, Product, Resources, Legal), newsletter signup, social media icons (Twitter, LinkedIn, Instagram, Facebook), and copyright text.",
      },
      {
        label: "Contact Form",
        prompt:
          "Add a contact form with fields: Name, Email, Phone (optional), Message (textarea), Submit button with loading state, form validation, and success/error messages.",
      },
      {
        label: "CTA Section",
        prompt:
          "Add a call-to-action section with gradient or colored background, compelling headline, supporting text, primary action button, and optional secondary link.",
      },
    ],
  },
  {
    name: "📦 Content Blocks",
    components: [
      {
        label: "Feature Grid",
        prompt:
          "Add a features section with 3-column grid layout, each feature has icon (Lucide React), title, description, and optional hover animation (lift effect).",
      },
      {
        label: "Pricing Table",
        prompt:
          "Add pricing section with 3 tiers in card layout: features list with checkmarks, price with period toggle (monthly/yearly), 'Most Popular' badge on middle tier, and CTA button per plan.",
      },
      {
        label: "Testimonials",
        prompt:
          "Add testimonials section with customer quotes in card layout, customer photo, name, role, company name, 5-star rating, and subtle card shadows with hover effects.",
      },
      {
        label: "FAQ Accordion",
        prompt:
          "Add FAQ section with collapsible accordion items, each with question, expandable answer, smooth transition animation, and optional category tabs for organization.",
      },
      {
        label: "Stats/Metrics",
        prompt:
          "Add statistics section with 4-column grid showing key metrics: large numbers (animated count-up), labels, percentage change indicators, and trend icons (up/down arrows).",
      },
      {
        label: "Team Section",
        prompt:
          "Add team section with grid of team member cards, each showing photo, name, role, short bio, and social media links (LinkedIn, Twitter). Hover reveals additional info.",
      },
    ],
  },
  {
    name: "🖼️ Visual Components",
    components: [
      {
        label: "Image Gallery",
        prompt:
          "Add image gallery with masonry or grid layout, hover zoom effects, lightbox functionality for full-screen view, image captions, and navigation arrows in lightbox.",
      },
      {
        label: "Logo Cloud",
        prompt:
          "Add logo showcase section with client/partner logos in grid or horizontal scroll, grayscale filter with color on hover, infinite auto-scroll animation option.",
      },
      {
        label: "Before/After Slider",
        prompt:
          "Add before/after image comparison slider with draggable divider, labels for 'Before' and 'After', smooth dragging interaction, and optional auto-play animation.",
      },
      {
        label: "Video Section",
        prompt:
          "Add video section with embedded YouTube/Vimeo player or native video, custom play button overlay, thumbnail image before play, and optional video caption/description.",
      },
      {
        label: "Icon Grid",
        prompt:
          "Add icon grid with colorful icons (Lucide React), each with title and short description underneath, 3-4 column responsive layout, and subtle hover animations.",
      },
    ],
  },
  {
    name: "📝 Forms & Inputs",
    components: [
      {
        label: "Newsletter Signup",
        prompt:
          "Add newsletter section with headline, email input field, subscribe button (inline or stacked), privacy text, and success confirmation message after submission.",
      },
      {
        label: "Multi-Step Form",
        prompt:
          "Add multi-step form with progress indicator (steps 1/2/3), next/previous buttons, form validation per step, smooth transitions between steps, and final review screen.",
      },
      {
        label: "Search Bar",
        prompt:
          "Add search component with input field, search icon, autocomplete suggestions dropdown, recent searches, and clear button. Full-width or compact variant.",
      },
      {
        label: "Booking Form",
        prompt:
          "Add booking/reservation form with date picker, time slot selector, number of people, special requests textarea, and confirmation summary with total price.",
      },
      {
        label: "Login/Signup Modal",
        prompt:
          "Add authentication modal with tabs for Login/Signup, email and password inputs, 'Forgot Password' link, social login buttons (Google, Facebook), and close button.",
      },
    ],
  },
  {
    name: "🛍️ E-commerce",
    components: [
      {
        label: "Product Grid",
        prompt:
          "Add product grid with product cards showing image, title, price (with discount if applicable), rating stars, 'Add to Cart' button, and quick view on hover.",
      },
      {
        label: "Product Card",
        prompt:
          "Add detailed product card with large image, image thumbnails, title, price, variant selector (size/color), quantity input, 'Add to Cart' and 'Buy Now' buttons, reviews section.",
      },
      {
        label: "Shopping Cart",
        prompt:
          "Add shopping cart component with item list (image, title, price, quantity controls), subtotal calculation, promo code input, shipping estimate, and checkout button.",
      },
      {
        label: "Product Reviews",
        prompt:
          "Add product reviews section with star rating histogram, filter by rating, individual reviews with user photo, name, date, rating, helpful votes, and 'Write Review' button.",
      },
      {
        label: "Category Filter",
        prompt:
          "Add product filter sidebar with category checkboxes, price range slider, brand filters, color swatches, rating filter, and 'Clear All Filters' button.",
      },
    ],
  },
  {
    name: "📊 Dashboard & Data",
    components: [
      {
        label: "Dashboard Cards",
        prompt:
          "Add dashboard metric cards with icon, metric title, large number display, percentage change (green/red), mini trend chart (sparkline), and timeframe selector.",
      },
      {
        label: "Data Table",
        prompt:
          "Add data table with sortable columns, search/filter functionality, pagination controls, row actions (edit/delete icons), row selection checkboxes, and export button.",
      },
      {
        label: "Chart Section",
        prompt:
          "Add charts section with tabs for different chart types (line, bar, pie), chart controls (date range, data toggle), legend, tooltips on hover, and download chart option.",
      },
      {
        label: "Activity Feed",
        prompt:
          "Add activity feed with timeline layout, activity items showing icon, description, timestamp, user avatar, and 'Load More' button at bottom.",
      },
      {
        label: "Progress Tracker",
        prompt:
          "Add progress tracking component with visual steps (completed/current/upcoming), percentage complete, milestone markers, estimated completion date, and status badges.",
      },
    ],
  },
  {
    name: "🎨 Advanced UI",
    components: [
      {
        label: "Tabs Component",
        prompt:
          "Add tabbed interface with tab navigation bar (horizontal or vertical), smooth content transitions, active tab indicator (underline or background), and lazy loading per tab.",
      },
      {
        label: "Accordion List",
        prompt:
          "Add accordion component with multiple expandable sections, smooth open/close animations, optional 'Expand All/Collapse All' controls, and icon rotation on toggle.",
      },
      {
        label: "Breadcrumbs",
        prompt:
          "Add breadcrumb navigation with home icon, page links separated by arrows or slashes, current page highlighted, truncation for long paths, and hover states.",
      },
      {
        label: "Pagination",
        prompt:
          "Add pagination component with previous/next buttons, page number buttons, current page highlighted, ellipsis for skipped pages, and 'Go to page' input option.",
      },
      {
        label: "Modal Dialog",
        prompt:
          "Add modal dialog with overlay backdrop, centered content area, close button (X icon), header/body/footer sections, smooth fade-in animation, and click-outside to close.",
      },
      {
        label: "Dropdown Menu",
        prompt:
          "Add dropdown menu with trigger button, menu items list, dividers between groups, icons next to labels, keyboard navigation support, and smooth slide-down animation.",
      },
      {
        label: "Toast Notifications",
        prompt:
          "Add toast notification system with success/error/warning/info variants, auto-dismiss timer, close button, stacking for multiple toasts, and slide-in animation from corner.",
      },
      {
        label: "Tooltip",
        prompt:
          "Add tooltip component that appears on hover, arrow pointing to target element, dark background with white text, fade-in animation, and smart positioning (top/bottom/left/right).",
      },
    ],
  },
  {
    name: "🌟 Interactive",
    components: [
      {
        label: "Image Carousel",
        prompt:
          "Add image carousel with auto-play, previous/next arrow buttons, dot indicators for slides, pause on hover, smooth slide transitions, and optional thumbnails navigation.",
      },
      {
        label: "Countdown Timer",
        prompt:
          "Add countdown timer displaying days, hours, minutes, seconds in card layout, animated number flips, optional labels, and custom styling for urgency (red when close).",
      },
      {
        label: "Animated Counter",
        prompt:
          "Add animated number counter that counts up when scrolled into view, smooth easing animation, optional prefix/suffix (€, +, %), and milestone celebration effect.",
      },
      {
        label: "Scroll Progress Bar",
        prompt:
          "Add scroll progress indicator at top of page, smooth horizontal bar that fills as user scrolls, custom color gradient, and optional percentage display.",
      },
      {
        label: "Parallax Section",
        prompt:
          "Add parallax scrolling section with background image that moves slower than foreground, overlay content, smooth motion effect, and optional multiple layers.",
      },
    ],
  },
  {
    name: "🗂️ Navigation",
    components: [
      {
        label: "Sidebar Navigation",
        prompt:
          "Add collapsible sidebar with navigation links, icons for each item, active state highlighting, nested sub-menus with indentation, collapse/expand button, and mobile slide-over.",
      },
      {
        label: "Mega Menu",
        prompt:
          "Add mega menu dropdown with multi-column layout, category sections with headers, featured items with images, 'View All' links, and smooth dropdown animation.",
      },
      {
        label: "Floating Action Button",
        prompt:
          "Add floating action button (FAB) fixed in corner, circular design with icon, ripple effect on click, optional speed dial (multiple actions), and smooth animations.",
      },
      {
        label: "Sticky Sidebar",
        prompt:
          "Add sticky sidebar that stays visible during scroll, table of contents with anchor links, active section highlighting, smooth scroll to sections, and responsive collapse on mobile.",
      },
    ],
  },
  {
    name: "📱 Modern Layouts",
    components: [
      {
        label: "Bento Grid",
        prompt:
          "Add bento grid layout (Pinterest-style) with mixed-size cards, each card has image/icon, title, description, hover lift effect, and responsive reflow.",
      },
      {
        label: "Timeline",
        prompt:
          "Add vertical timeline with alternating left/right content cards, connecting line in center, date markers, event icons, and smooth scroll animations as items appear.",
      },
      {
        label: "Kanban Board",
        prompt:
          "Add kanban-style board with drag-and-drop columns (To Do, In Progress, Done), task cards with title/tags/assignee, add new task button, and column limits indicator.",
      },
      {
        label: "Masonry Grid",
        prompt:
          "Add masonry grid layout (like Pinterest) with variable-height items, responsive columns (1-4 based on screen), lazy loading on scroll, and smooth item animations.",
      },
      {
        label: "Split Screen",
        prompt:
          "Add split-screen layout with two sections (50/50 or adjustable), left side for content/form, right side for image/graphic, responsive stack on mobile.",
      },
    ],
  },
  {
    name: "💬 Social & Community",
    components: [
      {
        label: "Comment Section",
        prompt:
          "Add comment section with nested replies (thread style), user avatars, timestamps, like/reply buttons, 'Load More' for pagination, and markdown support for formatting.",
      },
      {
        label: "Social Share",
        prompt:
          "Add social sharing buttons for Twitter, Facebook, LinkedIn, WhatsApp, Email, with share counts, copy link button, and optional compact/expanded view toggle.",
      },
      {
        label: "Author Bio",
        prompt:
          "Add author bio card with circular profile photo, name, role/title, short biography, social media links, 'Follow' button, and article count or stats.",
      },
      {
        label: "Rating Widget",
        prompt:
          "Add rating component with star display (1-5), half-star support, average rating number, total ratings count, and interactive hover preview for user rating input.",
      },
    ],
  },
  {
    name: "📄 Content",
    components: [
      {
        label: "Blog Card",
        prompt:
          "Add blog post card with featured image, category tag, title, excerpt (truncated), author info with avatar, publish date, read time estimate, and 'Read More' link.",
      },
      {
        label: "Article Header",
        prompt:
          "Add article header with large title, subtitle/excerpt, author avatar and name, publish date, reading time, category tags, social share buttons, and featured image.",
      },
      {
        label: "Related Posts",
        prompt:
          "Add related posts section at article bottom, 3-4 post cards with thumbnail, title, brief excerpt, and 'Read More' link. Algorithm suggestion: same category or tags.",
      },
      {
        label: "Table of Contents",
        prompt:
          "Add table of contents component extracted from article headings (H2, H3), anchor links to scroll to sections, active section highlighting, and sticky positioning.",
      },
    ],
  },
];

// Legacy flat array for backward compatibility
export const COMPONENTS: QuickPrompt[] = COMPONENT_CATEGORIES.flatMap((cat) => cat.components);

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
  ai: "AI",
  animations: "Animations",
  components: "Components",
  "login-and-sign-up": "Login & Sign Up",
  "blog-and-portfolio": "Blog & Portfolio",
  "design-systems": "Design Systems",
  layouts: "Layouts",
  "website-templates": "Website Templates",
  "apps-and-games": "Apps & Games",
};

// Get templates by category ID
export function getTemplatesByCategory(categoryId: string): Template[] {
  // Filter out category templates themselves (they have matching slug)
  const categorySlugs = Object.keys(V0_CATEGORIES);

  return TEMPLATES.filter((template) => {
    // Skip category templates
    if (categorySlugs.includes(template.slug)) {
      return false;
    }

    // Map template to category
    const templateCategory = getTemplateCategoryId(template);
    return templateCategory === categoryId;
  });
}

// Get all v0 categories
export function getAllV0Categories(): CategoryInfo[] {
  return Object.values(V0_CATEGORIES);
}

// Get template by ID
export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

// Get template image URL - use external Vercel Blob URL
export function getTemplateImageUrl(template: Template): string {
  // Primary source: external preview URL from v0.app (Vercel Blob storage)
  if (template.previewImageUrl) {
    return template.previewImageUrl;
  }
  // Fallback to local file (only category thumbnails exist locally)
  return `/templates/${template.imageFilename}`;
}
