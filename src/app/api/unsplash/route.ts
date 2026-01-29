import { FEATURES, SECRETS } from "@/lib/config";
import { NextRequest, NextResponse } from "next/server";

/**
 * Unsplash API Integration
 *
 * Searches for relevant stock photos based on query terms.
 * Returns images with P1, P2, P3... markers for easy reference.
 *
 * Free API: https://unsplash.com/developers
 * - Demo: 50 requests/hour
 * - Production: 5,000 requests/hour (requires approval)
 *
 * UNSPLASH REQUIREMENTS (for production approval):
 * 1. ✅ Hotlinking - We use Unsplash URLs directly (required!)
 * 2. ✅ Trigger downloads - Call /api/unsplash/download when photo is used
 * 3. ✅ Attribution - Include photographer name + Unsplash link
 *
 * See: https://unsplash.com/documentation#track-a-photo-download
 */

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
    username: string;
    links: {
      html: string;
    };
  };
  links: {
    html: string;
    download_location: string;
  };
}

interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

export interface MarkedImage {
  marker: string; // P1, P2, P3...
  id: string;
  url: string;
  urlMedium: string;
  urlSmall: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  width: number;
  height: number;
  // Required for Unsplash attribution
  unsplashUrl: string;
  // Required for Unsplash download tracking (call when photo is used!)
  downloadLocation?: string;
}

// Industry-specific search terms
const INDUSTRY_SEARCH_TERMS: Record<string, string[]> = {
  cafe: ["coffee shop", "barista", "latte art", "cafe interior", "pastries"],
  restaurant: ["restaurant interior", "fine dining", "chef cooking", "food plating", "wine glass"],
  retail: ["shopping", "retail store", "fashion", "boutique", "products"],
  tech: ["technology", "coding", "startup office", "modern workspace", "laptop work"],
  consulting: ["business meeting", "handshake", "office team", "strategy", "corporate"],
  health: ["wellness", "medical", "yoga", "healthy lifestyle", "spa"],
  creative: ["design studio", "creative", "art", "portfolio", "designer"],
  education: ["classroom", "students", "library", "online learning", "teacher"],
  ecommerce: ["online shopping", "package", "product photography", "ecommerce", "delivery"],
  nonprofit: ["volunteers", "community", "charity", "helping hands", "social impact"],
  realestate: ["modern house", "apartment interior", "real estate", "home", "architecture"],
};

// Get search terms based on industry
function getSearchTerms(industry: string, customTerms?: string[]): string[] {
  const industryTerms = INDUSTRY_SEARCH_TERMS[industry] || [];
  const defaultTerms = ["business", "professional", "modern"];

  if (customTerms && customTerms.length > 0) {
    return [...customTerms, ...industryTerms.slice(0, 2)];
  }

  return industryTerms.length > 0 ? industryTerms : defaultTerms;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { industry, customTerms, count = 5 } = body;

    // Use centralized config
    if (!FEATURES.useUnsplash) {
      console.log("[API/unsplash] No UNSPLASH_ACCESS_KEY found, using fallback");
      return NextResponse.json({
        success: true,
        images: generateFallbackImages(industry, count),
        source: "fallback",
        message: "Add UNSPLASH_ACCESS_KEY for real Unsplash photos.",
      });
    }

    const accessKey = SECRETS.unsplashAccessKey;

    const searchTerms = getSearchTerms(industry, customTerms);
    const allImages: MarkedImage[] = [];
    let marker = 1;

    // Search for each term to get variety
    for (const term of searchTerms.slice(0, Math.min(3, count))) {
      try {
        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
            term,
          )}&per_page=2&orientation=landscape`,
          {
            headers: {
              Authorization: `Client-ID ${accessKey}`,
              "Accept-Version": "v1",
            },
          },
        );

        if (!response.ok) {
          console.error(`[API/unsplash] Unsplash API error for "${term}":`, response.status);
          continue;
        }

        const data: UnsplashSearchResponse = await response.json();

        for (const photo of data.results) {
          if (allImages.length >= count) break;

          allImages.push({
            marker: `P${marker}`,
            id: photo.id,
            url: photo.urls.regular, // 1080px wide
            urlMedium: photo.urls.small, // 400px wide
            urlSmall: photo.urls.thumb, // 200px wide
            alt: photo.alt_description || photo.description || term,
            photographer: photo.user.name,
            photographerUrl: photo.user.links.html,
            width: photo.width,
            height: photo.height,
            unsplashUrl: photo.links.html,
            // CRITICAL: Track downloads per Unsplash API guidelines
            downloadLocation: photo.links.download_location,
          });
          marker++;
        }
      } catch (error) {
        console.error(`[API/unsplash] Error searching for "${term}":`, error);
      }

      if (allImages.length >= count) break;
    }

    console.log(`[API/unsplash] Found ${allImages.length} images for industry: ${industry}`);

    return NextResponse.json({
      success: true,
      images: allImages,
      source: "unsplash",
    });
  } catch (error) {
    console.error("[API/unsplash] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch images" }, { status: 500 });
  }
}

// GET endpoint for simple queries
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("query") || "business";
  const count = parseInt(searchParams.get("count") || "5", 10);

  // Use centralized config
  if (!FEATURES.useUnsplash) {
    return NextResponse.json({
      success: true,
      images: generateFallbackImages("other", count),
      source: "fallback",
    });
  }

  const accessKey = SECRETS.unsplashAccessKey;

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query,
      )}&per_page=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          "Accept-Version": "v1",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data: UnsplashSearchResponse = await response.json();

    const images: MarkedImage[] = data.results.map((photo, index) => ({
      marker: `P${index + 1}`,
      id: photo.id,
      url: photo.urls.regular,
      urlMedium: photo.urls.small,
      urlSmall: photo.urls.thumb,
      alt: photo.alt_description || photo.description || query,
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      width: photo.width,
      height: photo.height,
      unsplashUrl: photo.links.html,
      // CRITICAL: Track downloads per Unsplash API guidelines
      downloadLocation: photo.links.download_location,
    }));

    return NextResponse.json({
      success: true,
      images,
      source: "unsplash",
    });
  } catch (error) {
    console.error("[API/unsplash] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch images" }, { status: 500 });
  }
}

// Generate fallback placeholder images when no API key
function generateFallbackImages(industry: string, count: number): MarkedImage[] {
  const colors: Record<string, string> = {
    cafe: "8B4513",
    restaurant: "DC143C",
    retail: "4169E1",
    tech: "1E90FF",
    consulting: "2F4F4F",
    health: "3CB371",
    creative: "FF6347",
    education: "FFD700",
    ecommerce: "FF8C00",
    nonprofit: "9370DB",
    realestate: "20B2AA",
    other: "708090",
  };

  const color = colors[industry] || colors.other;
  const images: MarkedImage[] = [];

  for (let i = 1; i <= count; i++) {
    images.push({
      marker: `P${i}`,
      id: `placeholder-${i}`,
      url: `https://placehold.co/1200x800/${color}/FFFFFF?text=P${i}`,
      urlMedium: `https://placehold.co/800x600/${color}/FFFFFF?text=P${i}`,
      urlSmall: `https://placehold.co/400x300/${color}/FFFFFF?text=P${i}`,
      alt: `Placeholder image ${i} for ${industry}`,
      photographer: "Placeholder",
      photographerUrl: "",
      width: 1200,
      height: 800,
      unsplashUrl: "",
    });
  }

  return images;
}
