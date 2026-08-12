from __future__ import annotations

PAGE_NAME = "Scaffolds & varianter: skapa, redigera, klona, ta bort"



THEME_TOKEN_KEYS = (
    "background",
    "foreground",
    "card",
    "cardForeground",
    "primary",
    "primaryForeground",
    "secondary",
    "secondaryForeground",
    "muted",
    "mutedForeground",
    "accent",
    "accentForeground",
    "border",
    "ring",
    "radius",
    "bodyBackgroundImage",
)



SITE_KIND_OPTIONS = ("marketing", "app", "commerce", "editorial")


COMPLEXITY_OPTIONS = ("simple", "medium", "advanced")


BUILD_INTENT_OPTIONS = ("website", "app", "template")




# Minsta signaturePatterns-krav som CI-grinden
# (`src/lib/gen/scaffold-variants/variant-integrity.test.ts`) tvingar: >=3
# layouts, >=2 motifs, >=2 antiPatterns. Speglas här så backoffice inte kan
# spara en halvfärdig variant som testet sedan fäller.
_SIG_MIN_LAYOUTS = 3


_SIG_MIN_MOTIFS = 2


_SIG_MIN_ANTI = 2




_POST_ACTION_NOTE_KEY = "scaffold_lifecycle_post_action_note"




_REBUILD_EMBEDDINGS_HINT = (
    "Kör sedan `npm run scaffolds:variant-embeddings` så varianten registreras i "
    "matchnings-indexet (`variant-embeddings.json`) — annars fäller CI-grinden "
    "(`variant-integrity.test.ts`) den som saknad tills indexet byggts om."
)




BLOB_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"




BASELINE_TAG = "scaffold-baseline-v1"


BASELINE_PATHS = (
    "src/lib/gen/scaffolds",
    "config/scaffold-variants",
    "docs/schemas/strict/scaffold-variant.schema.json",
)
