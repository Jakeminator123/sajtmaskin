import { NextRequest, NextResponse } from "next/server";
import { SECRETS, FEATURES } from "@/lib/config";

/**
 * Pexels API Integration
 *
 * Searches for relevant stock photos based on query terms.
 * Returns images with P1, P2, P3... markers for easy reference.
 *
 * Free API: https://www.pexels.com/api/
 */

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
}

export interface MarkedImage {
  marker: string; // P1, P2, P3...
  id: number;
  url: string;
  urlMedium: string;
  urlSmall: string;
  alt: string;
  photographer: string;
  width: number;
  height: number;
}

// Industry-specific search terms
const INDUSTRY_SEARCH_TERMS: Record<string, string[]> = {
  cafe: [
    "coffee shop interior",
    "barista",
    "coffee cup",
    "cafe atmosphere",
    "pastry bakery",
  ],
  restaurant: [
    "restaurant interior",
    "fine dining",
    "chef cooking",
    "food plating",
    "wine dining",
  ],
  retail: [
    "shopping bags",
    "retail store",
    "fashion display",
    "boutique interior",
    "product showcase",
  ],
  tech: [
    "technology office",
    "coding laptop",
    "startup team",
    "modern workspace",
    "digital innovation",
  ],
  consulting: [
    "business meeting",
    "professional handshake",
    "office team",
    "strategy planning",
    "corporate",
  ],
  health: [
    "wellness spa",
    "medical professional",
    "yoga meditation",
    "healthy lifestyle",
    "clinic interior",
  ],
  creative: [
    "design studio",
    "creative workspace",
    "art gallery",
    "portfolio display",
    "designer working",
  ],
  education: [
    "classroom learning",
    "students studying",
    "library books",
    "online education",
    "teacher",
  ],
  ecommerce: [
    "online shopping",
    "package delivery",
    "product photography",
    "shopping cart",
    "ecommerce",
  ],
  nonprofit: [
    "volunteers helping",
    "community support",
    "charity work",
    "hands together",
    "social impact",
  ],
  realestate: [
    "modern house",
    "luxury apartment",
    "interior design",
    "real estate agent",
    "home exterior",
  ],
};

// Get search terms based on industry
function getSearchTerms(industry: string, customTerms?: string[]): string[] {
  const industryTerms = INDUSTRY_SEARCH_TERMS[industry] || [];
  const defaultTerms = ["modern business", "professional", "workspace"];

  if (customTerms && customTerms.length > 0) {
    return [...customTerms, ...industryTerms.slice(0, 2)];
  }

  return industryTerms.length > 0 ? industryTerms : defaultTerms;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { industry, customTerms, count = 5 } = body;

    // Use centralized config for API key
    if (!FEATURES.usePexels) {
      console.log(
        "[API/pexels] No PEXELS_API_KEY found, using fallback placeholders"
      );
      return NextResponse.json({
        success: true,
        images: generateFallbackImages(industry, count),
        source: "fallback",
        message:
          "Using placeholder images. Add PEXELS_API_KEY for real photos.",
      });
    }

    const apiKey = SECRETS.pexelsApiKey;

    const searchTerms = getSearchTerms(industry, customTerms);
    const allImages: MarkedImage[] = [];
    let marker = 1;

    // Search for each term to get variety
    for (const term of searchTerms.slice(0, Math.min(3, count))) {
      try {
        const response = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(
            term
          )}&per_page=2&orientation=landscape`,
          {
            headers: {
              Authorization: apiKey,
            },
          }
        );

        if (!response.ok) {
          console.error(
            `[API/pexels] Pexels API error for "${term}":`,
            response.status
          );
          continue;
        }

        const data: PexelsResponse = await response.json();

        for (const photo of data.photos) {
          if (allImages.length >= count) break;

          allImages.push({
            marker: `P${marker}`,
            id: photo.id,
            url: photo.src.large,
            urlMedium: photo.src.medium,
            urlSmall: photo.src.small,
            alt: photo.alt || term,
            photographer: photo.photographer,
            width: photo.width,
            height: photo.height,
          });
          marker++;
        }
      } catch (error) {
        console.error(`[API/pexels] Error searching for "${term}":`, error);
      }

      if (allImages.length >= count) break;
    }

    console.log(
      `[API/pexels] Found ${allImages.length} images for industry: ${industry}`
    );

    return NextResponse.json({
      success: true,
      images: allImages,
      source: "pexels",
    });
  } catch (error) {
    console.error("[API/pexels] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}

// GET endpoint for simple queries
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("query") || "business";
  const count = parseInt(searchParams.get("count") || "5", 10);

  // Use centralized config
  if (!FEATURES.usePexels) {
    return NextResponse.json({
      success: true,
      images: generateFallbackImages("other", count),
      source: "fallback",
    });
  }

  const apiKey = SECRETS.pexelsApiKey;

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(
        query
      )}&per_page=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data: PexelsResponse = await response.json();

    const images: MarkedImage[] = data.photos.map((photo, index) => ({
      marker: `P${index + 1}`,
      id: photo.id,
      url: photo.src.large,
      urlMedium: photo.src.medium,
      urlSmall: photo.src.small,
      alt: photo.alt || query,
      photographer: photo.photographer,
      width: photo.width,
      height: photo.height,
    }));

    return NextResponse.json({
      success: true,
      images,
      source: "pexels",
    });
  } catch (error) {
    console.error("[API/pexels] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}

// Generate fallback placeholder images when no API key
function generateFallbackImages(
  industry: string,
  count: number
): MarkedImage[] {
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
      id: i,
      url: `https://placehold.co/1200x800/${color}/FFFFFF?text=P${i}`,
      urlMedium: `https://placehold.co/800x600/${color}/FFFFFF?text=P${i}`,
      urlSmall: `https://placehold.co/400x300/${color}/FFFFFF?text=P${i}`,
      alt: `Placeholder image ${i} for ${industry}`,
      photographer: "Placeholder",
      width: 1200,
      height: 800,
    });
  }

  return images;
}
