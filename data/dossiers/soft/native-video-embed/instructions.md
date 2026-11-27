# When to use

Embed a selected video attachment, a supplied direct video URL, an existing project file, or a saved media-library MP4. Use the native player for a hero, product demo, campaign or video section. Use the provider's supported embed for video-hosting watch pages. Conference calls and visitor uploads are separate features.

# How to integrate

- Use the **exact supplied video URL**, including its query string, or a verified existing public project path. Keep the current source on unrelated edits. Use only the videos selected for this build, and keep a selected poster paired with its film.
- If the user explicitly asks to create a new clip, guide them to **Skapa video** in Sajtmaskin's media library. After the job succeeds and the film is saved, use the selected library asset's stable URL through the normal attachment flow. If the asset has no playable URL yet, keep the existing section or a static fallback.

# UX rules

- Use native `<video controls playsInline preload="metadata">` for content. Set a descriptive accessible label. Provide supplied captions with `<track kind="captions">` and an adjacent transcript when supplied or requested. Use a real, relevant poster if available, or omit `poster`. Offer a direct source link when playback is unsupported.
- Fit the player to its section with a stable, responsive aspect ratio matching the source. Preserve the whole frame by default with `object-contain`. Crop with `object-cover` only for decorative backgrounds. Keep surrounding text and CTA legible at all widths.
- Start content video on user interaction. For an explicitly requested moving background, use a muted decorative loop with a pause control. Show a static poster or stable fallback until the reduced-motion preference is known, and keep it static when `prefers-reduced-motion: reduce` applies.

# Avoid

- Invented filenames, stock substitutions, transient generation-result URLs, and imaginary playback controls.
- Provider SDKs, provider credentials, generation requests and credit charges in generated site code. The platform's media-library action owns generation and billing.

# Verification

- With the selected URL, verify play and pause by keyboard on a narrow and wide viewport. Check that reduced motion keeps a decorative background static and its foreground readable.
