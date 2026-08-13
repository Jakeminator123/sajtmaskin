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
    "Indexera med knapparna i Backoffice (`scaffolds:embeddings` / "
    "`scaffolds:variant-embeddings --require-blob`) så matchningen publiceras "
    "till Vercel Blob — annars pekar Auto-match fel och CI-grinden "
    "(`variant-integrity.test.ts`) fäller saknad vektor."
)




BLOB_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"




BASELINE_TAG = "scaffold-baseline-v1"


BASELINE_PATHS = (
    "src/lib/gen/scaffolds",
    "config/scaffold-variants",
    "docs/schemas/strict/scaffold-variant.schema.json",
)
