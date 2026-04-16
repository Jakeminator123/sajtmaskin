# Motion
<!-- directive: motion -->
<!-- cascade: explicit > indicated > inferred > default -->

The motion profile controls animation level across the generated site.

## Profile: balanced (default)
<!-- default: balanced -->

- Add tasteful motion throughout: hover states, scroll-reveal animations (fade-in, slide-up), micro-interactions.
- Include subtle motion in hero and at least 2 additional sections.
- Use Tailwind animate-* utilities for simple motion and motion-safe/motion-reduce variants to respect user preferences.
- Avoid custom @keyframes or @property CSS rules unless explicitly requested.
- Respect prefers-reduced-motion for accessibility.
- Use consistent animation hooks (data-animate, data-stagger, data-delay) so motion can be extended later.

## Profile: lively

When the brief, tone, or prompt indicates lively/animated/dynamic/energetic:

- Add richer motion: staggered entrances, scroll-triggered reveals, gentle parallax, floating accents.
- For complex sequences, framer-motion is allowed; otherwise stick to Tailwind animate-* utilities.
- Go heavy on animations — scroll-triggered reveals, parallax, floating elements — when style keywords include "animated", "dynamic", "motion".
- Use consistent animation hooks (data-animate, data-stagger, data-delay) so motion can be extended later.

## Profile: static

When the brief or prompt explicitly requests minimal/no animation:

- Keep motion minimal: only subtle hover and focus states.
- Avoid scroll-reveal, autoplay, parallax, looping, and background animations.
- Default to reduced motion (motion-reduce:animate-none) and respect prefers-reduced-motion.
- Add data-animate hooks for future upgrades, but keep animations inactive for now.

## Tone Modifiers
<!-- default: none -->

- Playful/fun/energetic tone → Use bouncy, playful micro-interactions and generous spring easing.
- Professional/corporate/formal tone → Add restrained, professional motion: subtle fades and clean transitions only.
- Minimal/clean/simple style → Skip "at least 2 additional sections" motion rule.
