/**
 * API Route: Find competitors using Google Places API
 * POST /api/competitors
 *
 * Takes location and industry type, finds nearby competitors
 * and returns their information (name, rating, reviews, etc.)
 *
 * Requires GOOGLE_MAPS_API_KEY environment variable
 */

import { NextRequest, NextResponse } from "next/server";

// Allow 30 seconds for Google Places API
export const maxDuration = 30;

// Industry to Google Places type mapping
const INDUSTRY_TO_PLACES_TYPE: Record<string, string> = {
  cafe: "cafe",
  restaurant: "restaurant",
  retail: "store",
  tech: "establishment", // Generic for offices
  consulting: "establishment",
  health: "health",
  creative: "establishment",
  education: "school",
  ecommerce: "store",
  nonprofit: "establishment",
  realestate: "real_estate_agency",
  other: "establishment",
};

// Industry keywords for text search (more specific than type)
const INDUSTRY_KEYWORDS: Record<string, string> = {
  cafe: "café coffee shop",
  restaurant: "restaurant bar",
  retail: "butik shop store",
  tech: "IT tech company",
  consulting: "konsult consulting",
  health: "gym wellness spa health",
  creative: "design byrå creative agency",
  education: "skola kurs utbildning",
  ecommerce: "shop store",
  nonprofit: "ideell förening organization",
  realestate: "mäklare fastigheter",
};

export interface Competitor {
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  types: string[];
  priceLevel: number | null;
  website?: string;
  distance?: string;
}

export async function POST(req: NextRequest) {
  console.log("[API/competitors] Request received");

  try {
    const { location, industry } = (await req.json()) as {
      location: string;
      industry: string;
    };

    if (!location) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      );
    }

    // Get Google Maps API key
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
      console.warn("[API/competitors] Google Maps API key not configured");
      // Return mock data for testing/demo purposes
      return NextResponse.json({
        success: true,
        competitors: getMockCompetitors(industry),
        isMock: true,
        message: "Google Maps API inte konfigurerad - visar exempeldata",
      });
    }

    console.log("[API/competitors] Searching for:", { location, industry });

    // Step 1: Geocode the location to get coordinates
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      location
    )}&key=${googleApiKey}&language=sv`;

    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (
      geocodeData.status !== "OK" ||
      !geocodeData.results ||
      geocodeData.results.length === 0
    ) {
      console.warn("[API/competitors] Geocoding failed:", geocodeData.status);
      return NextResponse.json({
        success: true,
        competitors: [],
        message: "Kunde inte hitta platsen. Kontrollera adressen.",
      });
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;
    console.log("[API/competitors] Location coordinates:", { lat, lng });

    // Step 2: Search for nearby places
    const placeType = INDUSTRY_TO_PLACES_TYPE[industry] || "establishment";
    const keyword = INDUSTRY_KEYWORDS[industry] || "";

    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1500&type=${placeType}&keyword=${encodeURIComponent(
      keyword
    )}&key=${googleApiKey}&language=sv`;

    const nearbyResponse = await fetch(nearbyUrl);
    const nearbyData = await nearbyResponse.json();

    if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
      console.error("[API/competitors] Places API error:", nearbyData.status);
      return NextResponse.json(
        { success: false, error: "Failed to search for competitors" },
        { status: 500 }
      );
    }

    // Parse results
    const competitors: Competitor[] = (nearbyData.results || [])
      .slice(0, 10) // Limit to 10 competitors
      .map(
        (place: {
          name: string;
          vicinity: string;
          rating?: number;
          user_ratings_total?: number;
          types?: string[];
          price_level?: number;
        }) => ({
          name: place.name,
          address: place.vicinity,
          rating: place.rating || null,
          reviewCount: place.user_ratings_total || 0,
          types: place.types || [],
          priceLevel: place.price_level ?? null,
        })
      );

    console.log("[API/competitors] Found:", competitors.length, "competitors");

    return NextResponse.json({
      success: true,
      competitors,
      location: {
        formatted: geocodeData.results[0].formatted_address,
        coordinates: { lat, lng },
      },
    });
  } catch (error) {
    console.error("[API/competitors] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to find competitors. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Mock data for testing when Google API is not configured
function getMockCompetitors(industry: string): Competitor[] {
  const mockData: Record<string, Competitor[]> = {
    cafe: [
      {
        name: "Café Norrmalm",
        address: "Sveavägen 42",
        rating: 4.5,
        reviewCount: 128,
        types: ["cafe", "food"],
        priceLevel: 2,
      },
      {
        name: "Espresso House",
        address: "Drottninggatan 15",
        rating: 4.2,
        reviewCount: 456,
        types: ["cafe"],
        priceLevel: 2,
      },
      {
        name: "Wayne's Coffee",
        address: "Kungsgatan 8",
        rating: 4.0,
        reviewCount: 234,
        types: ["cafe", "food"],
        priceLevel: 2,
      },
    ],
    restaurant: [
      {
        name: "Restaurang Gondolen",
        address: "Stadsgården 6",
        rating: 4.4,
        reviewCount: 890,
        types: ["restaurant"],
        priceLevel: 3,
      },
      {
        name: "Meatballs for the People",
        address: "Nytorgsgatan 30",
        rating: 4.6,
        reviewCount: 567,
        types: ["restaurant"],
        priceLevel: 2,
      },
    ],
    default: [
      {
        name: "Exempelföretag 1",
        address: "Storgatan 1",
        rating: 4.3,
        reviewCount: 45,
        types: ["establishment"],
        priceLevel: null,
      },
      {
        name: "Exempelföretag 2",
        address: "Kungsgatan 12",
        rating: 4.1,
        reviewCount: 23,
        types: ["establishment"],
        priceLevel: null,
      },
    ],
  };

  return mockData[industry] || mockData.default;
}
