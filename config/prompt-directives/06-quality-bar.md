# Quality Bar
<!-- directive: quality-bar -->
<!-- cascade: explicit > indicated > inferred > default -->

## Standard Quality (default)
<!-- default: standard -->

- Aim for a premium, layered look: cards with borders, soft shadows, glassy panels, depth.
- Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel, alternating sections.
- Increase visual density with tasteful imagery, lucide-react icons, and decorative accents.
- Avoid flat, empty sections; use section separators, background bands, or subtle gradients.

### Minimum visual complexity (all quality levels)
1. **Section variety**: No two adjacent sections may use the same background. Alternate between solid, gradient, image-with-overlay, muted, and accent backgrounds.
2. **Card treatments**: `rounded-2xl p-8 shadow-lg` minimum. Add `hover:shadow-2xl hover:-translate-y-1 transition-all duration-300`.
3. **Button polish**: Primary CTAs `rounded-full px-8 py-3 text-lg font-semibold hover:scale-105 transition-all`.
4. **Spacing**: Hero `py-24 lg:py-32`. Content sections `py-16 lg:py-24`. Never `py-4` or `py-8` as main section padding.
5. **Color depth**: At LEAST 3 surface colors (bg-background, bg-muted, bg-primary/5, a gradient, bg-card).

### Section design standards
- **Hero**: Immersive — `min-h-[70vh]` with background image/gradient overlay OR bold gradient. Plain white hero = FAILURE.
- **Feature/Service cards**: Icon OR image, heading, 2-3 sentence description, visual accent.
- **Testimonials**: Name, role, quote, optional photo. Styled with quote marks or card treatment.
- **CTA sections**: Contrasting background with large text and prominent button.
- **Footer**: Multi-column with logo, nav links, contact info, social icons.

## Minimal/Clean Override

When style keywords include "minimal", "clean", or "simple":

- Aim for a clean, minimal look: generous whitespace, sharp typography, few decorative elements.
- Use simple layouts: single-column hero, clean card grid, focused CTAs.
- Avoid visual clutter; let content breathe with consistent spacing.

## Bold/Dramatic Override

When style keywords include "bold", "dramatic", "intense", or "maximal":

- Go bold: oversized typography, full-bleed images, high-contrast sections.

## Playful Override

When tone includes "playful", "fun", or "whimsical":

- Add personality: custom illustrations, emoji accents, or quirky layout variations.
