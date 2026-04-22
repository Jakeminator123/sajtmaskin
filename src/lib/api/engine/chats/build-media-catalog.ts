/**
 * Shared media-catalog builder used by both create-chat and chat-message
 * streaming routes.
 *
 * Mål: varje turn (create + follow-up) får samma setup med user-uploads +
 * stock-fallback, så modellen alltid har bild/video-alias tillgängliga
 * oavsett om det är första eller tionde meddelandet i en chat.
 *
 * Inputs:
 *   - requestAttachments: normaliserade attachments från parseChatRequestMeta
 *   - brief: senaste brief (kan vara null)
 *   - offerFallback: prompt-text att använda som "offer" om brief saknar pitch
 *
 * Output: { mediaCatalog, urlMapOverrides, userMediaUrls }
 *   - mediaCatalog: passas till OrchestrationInput.mediaCatalog
 *   - urlMapOverrides: alias → url (merges into compressUrls' urlMap)
 *   - userMediaUrls: ren lista med bildurler för VM/attribution
 *
 * Stock-fetch är best-effort: fel loggas men blockerar aldrig generation.
 */

import { debugLog } from "@/lib/utils/debug";
import {
  buildStockImageQueries,
  fetchStockImages,
  fetchStockVideos,
  type StockImagePurpose,
} from "@/lib/media/stock-providers";
import type { MediaCatalogItem } from "@/lib/gen/system-prompt";
import type { RequestAttachment } from "@/lib/gen/request-metadata";

export interface BuildMediaCatalogInput {
  requestAttachments: RequestAttachment[];
  brief: unknown;
  offerFallback: string;
}

export interface BuildMediaCatalogResult {
  mediaCatalog: MediaCatalogItem[];
  urlMapOverrides: Record<string, string>;
  userMediaUrls: string[];
}

/**
 * Regex used to detect whether an uploaded attachment is the user's brand
 * logo. Kept in sync with the `isLogo` heuristic in
 * `summarizeDesignReferences` so the same image gets the same treatment
 * both in the design-reference prompt block and in the media catalog.
 */
const LOGO_ATTACHMENT_RE = /\b(logo|logotyp|logga|brand|varumärke)\b/i;

function isLogoAttachment(attachment: { purpose?: string; filename?: string }): boolean {
  return LOGO_ATTACHMENT_RE.test(`${attachment.purpose || ""} ${attachment.filename || ""}`);
}

export async function buildMediaCatalogForOrchestration(
  input: BuildMediaCatalogInput,
): Promise<BuildMediaCatalogResult> {
  const { requestAttachments, brief, offerFallback } = input;

  const imageAttachments = requestAttachments.filter(
    (a) =>
      a.mimeType?.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg)$/i.test(a.url),
  );

  // Assign `USER_LOGO` alias to the first attachment matching the logo
  // heuristic so generated sites reliably pick it up in header/footer.
  // Remaining images keep the `USER_IMG_N` sequence (starting at 1).
  let logoAssigned = false;
  let userImgIndex = 0;
  const mediaCatalog: MediaCatalogItem[] = imageAttachments.map((a, i) => {
    if (!logoAssigned && isLogoAttachment(a)) {
      logoAssigned = true;
      return {
        alias: "USER_LOGO",
        url: a.url,
        alt: a.purpose || a.filename || "Brand logo",
        source: "user" as const,
        kind: "logo" as const,
      };
    }
    userImgIndex += 1;
    return {
      alias: `USER_IMG_${userImgIndex}`,
      url: a.url,
      alt: a.purpose || a.filename || `User image ${i + 1}`,
      source: "user" as const,
    };
  });

  const briefLike = (brief ?? {}) as Record<string, unknown>;
  const briefOffer =
    (typeof briefLike.oneSentencePitch === "string" && briefLike.oneSentencePitch) ||
    (typeof briefLike.tagline === "string" && briefLike.tagline) ||
    (typeof briefLike.description === "string" && briefLike.description) ||
    offerFallback;
  const briefCategoryId =
    (typeof briefLike.categoryId === "string" && briefLike.categoryId) ||
    (typeof briefLike.siteType === "string" && briefLike.siteType) ||
    null;
  const briefIndustry = typeof briefLike.industry === "string" ? briefLike.industry : null;

  const userImageCount = mediaCatalog.length;
  const purposes: StockImagePurpose[] = [];
  if (userImageCount < 1) purposes.push("hero-image");
  const galleryDeficit = Math.max(
    0,
    2 - Math.max(0, userImageCount - (userImageCount < 1 ? 0 : 1)),
  );
  for (let i = 0; i < galleryDeficit; i += 1) purposes.push("gallery-image");

  if (purposes.length > 0) {
    const queries = buildStockImageQueries({
      categoryId: briefCategoryId,
      industry: briefIndustry,
      offer: typeof briefOffer === "string" ? briefOffer : null,
      purposes,
    });
    try {
      const fetched = (
        await Promise.all(queries.map((q) => fetchStockImages(q.query, 1)))
      ).flat();
      fetched.forEach((asset, i) => {
        mediaCatalog.push({
          alias: `STOCK_IMG_${i + 1}`,
          url: asset.url,
          alt: asset.alt,
          source: "stock",
          credit: `${asset.credit.name} (${asset.credit.provider})`,
        });
      });
      debugLog("orchestration", "Stock image fallback merged", {
        requested: purposes.length,
        received: fetched.length,
        userImageCount,
      });
    } catch (err) {
      debugLog("orchestration", "Stock image fallback failed (non-fatal)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const hasUserVideo = requestAttachments.some(
    (a) => a.mimeType?.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(a.url),
  );
  if (!hasUserVideo) {
    try {
      const [videoQuery] = buildStockImageQueries({
        categoryId: briefCategoryId,
        industry: briefIndustry,
        offer: typeof briefOffer === "string" ? briefOffer : null,
        purposes: ["hero-image"],
      });
      if (videoQuery) {
        const videos = await fetchStockVideos(videoQuery.query, 1);
        videos.forEach((asset, i) => {
          mediaCatalog.push({
            alias: `STOCK_VID_${i + 1}`,
            url: asset.url,
            alt: asset.alt,
            source: "stock",
            credit: `${asset.credit.name} (${asset.credit.provider})`,
          });
        });
        if (videos.length > 0) {
          debugLog("orchestration", "Stock video fallback merged", {
            received: videos.length,
          });
        }
      }
    } catch (err) {
      debugLog("orchestration", "Stock video fallback failed (non-fatal)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const urlMapOverrides: Record<string, string> = {};
  for (const item of mediaCatalog) {
    urlMapOverrides[item.alias] = item.url;
  }

  const userMediaUrls = mediaCatalog.map((m) => m.url);

  return { mediaCatalog, urlMapOverrides, userMediaUrls };
}
