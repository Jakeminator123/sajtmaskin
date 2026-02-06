/**
 * Error Messages
 * ==============
 *
 * Centraliserade, användarvänliga felmeddelanden på svenska.
 * Används för att ge tydlig feedback istället för generiska "Något gick fel".
 */

// Authentication errors
export const AUTH_ERRORS = {
  NOT_LOGGED_IN: "Du måste vara inloggad för att fortsätta",
  SESSION_EXPIRED: "Din session har gått ut. Vänligen logga in igen",
  USER_NOT_FOUND: "Användarkontot hittades inte",
  INVALID_CREDENTIALS: "Fel e-post eller lösenord",
  EMAIL_ALREADY_EXISTS: "E-postadressen används redan",
  WEAK_PASSWORD: "Lösenordet är för svagt. Använd minst 8 tecken",
  UNAUTHORIZED: "Du har inte behörighet att utföra denna åtgärd",
} as const;

// Credit/payment errors
export const CREDIT_ERRORS = {
  INSUFFICIENT_CREDITS: (required: number, current: number) =>
    `Du behöver ${required} credits men har bara ${current}. Köp fler credits för att fortsätta.`,
  DEDUCTION_FAILED: "Kunde inte dra credits. Försök igen.",
  PAYMENT_FAILED: "Betalningen misslyckades. Kontrollera dina kortuppgifter.",
  SUBSCRIPTION_EXPIRED: "Din prenumeration har gått ut",
} as const;

// Generation errors
export const GENERATION_ERRORS = {
  PROMPT_MISSING: "Beskriv vad du vill skapa",
  PROMPT_TOO_SHORT: "Beskriv mer detaljerat vad du vill ha (minst 10 tecken)",
  PROMPT_TOO_LONG: "Beskrivningen är för lång (max 10 000 tecken)",
  GENERATION_FAILED: "Genereringen misslyckades. Försök igen med en annan beskrivning.",
  GENERATION_TIMEOUT: "Genereringen tog för lång tid. Försök med en enklare beskrivning.",
  V0_API_ERROR: "Kunde inte kontakta AI-tjänsten. Försök igen om en stund.",
  V0_RATE_LIMITED: "För många förfrågningar. Vänta en minut och försök igen.",
  V0_QUOTA_EXCEEDED: "AI-tjänstens kvot är slut. Försök igen senare.",
  INVALID_QUALITY: "Ogiltig kvalitetsnivå. Välj standard eller premium.",
  NO_CODE_GENERATED: "Ingen kod genererades. Försök med en tydligare beskrivning.",
  REFINEMENT_FAILED: "Förfining misslyckades. Försök med en annan instruktion.",
} as const;

// File/upload errors
export const FILE_ERRORS = {
  FILE_TOO_LARGE: (maxSize: string) => `Filen är för stor. Max storlek är ${maxSize}.`,
  INVALID_FILE_TYPE: "Filtypen stöds inte. Använd JPG, PNG, GIF, WebP eller SVG.",
  UPLOAD_FAILED: "Uppladdningen misslyckades. Kontrollera din internetanslutning.",
  FILE_NOT_FOUND: "Filen hittades inte",
  DOWNLOAD_FAILED: "Nedladdningen misslyckades. Försök igen.",
} as const;

// Project errors
export const PROJECT_ERRORS = {
  PROJECT_NOT_FOUND: "Projektet hittades inte",
  PROJECT_ACCESS_DENIED: "Du har inte tillgång till detta projekt",
  PROJECT_SAVE_FAILED: "Kunde inte spara projektet. Försök igen.",
  PROJECT_DELETE_FAILED: "Kunde inte ta bort projektet",
  PROJECT_LIMIT_REACHED: "Du har nått max antal projekt. Ta bort ett för att skapa nytt.",
} as const;

// Deployment errors
export const DEPLOY_ERRORS = {
  DEPLOY_FAILED: "Publicering misslyckades. Kontrollera koden och försök igen.",
  DOMAIN_UNAVAILABLE: "Domännamnet är inte tillgängligt",
  DOMAIN_PURCHASE_FAILED: "Kunde inte köpa domänen. Försök igen.",
  VERCEL_ERROR: "Fel vid kontakt med Vercel. Försök igen senare.",
} as const;

// Network/server errors
export const NETWORK_ERRORS = {
  CONNECTION_FAILED: "Kunde inte ansluta. Kontrollera din internetanslutning.",
  SERVER_ERROR: "Serverfel. Vi arbetar på att lösa problemet.",
  SERVICE_UNAVAILABLE: "Tjänsten är tillfälligt otillgänglig. Försök igen senare.",
  TIMEOUT: "Förfrågan tog för lång tid. Försök igen.",
  UNKNOWN: "Ett oväntat fel uppstod. Försök igen.",
} as const;

// Image generation errors
export const IMAGE_ERRORS = {
  GENERATION_FAILED: "Bildgenereringen misslyckades. Försök med en annan beskrivning.",
  INVALID_PROMPT: "Beskrivningen kunde inte användas för bildgenerering.",
  NSFW_DETECTED: "Innehållet bryter mot riktlinjerna.",
} as const;

// Web scraping errors
export const SCRAPE_ERRORS = {
  URL_INVALID: "Ogiltig URL. Kontrollera adressen och försök igen.",
  SITE_BLOCKED: "Webbplatsen blockerar åtkomst.",
  SITE_NOT_FOUND: "Webbplatsen hittades inte.",
  SCRAPE_FAILED: "Kunde inte hämta webbsidan. Försök med en annan URL.",
} as const;

/**
 * Get a user-friendly error message from an Error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for known error patterns
    const msg = error.message.toLowerCase();

    if (msg.includes("rate limit") || msg.includes("429")) {
      return GENERATION_ERRORS.V0_RATE_LIMITED;
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return GENERATION_ERRORS.GENERATION_TIMEOUT;
    }
    if (msg.includes("quota") || msg.includes("exceeded")) {
      return GENERATION_ERRORS.V0_QUOTA_EXCEEDED;
    }
    if (msg.includes("unauthorized") || msg.includes("401")) {
      return AUTH_ERRORS.SESSION_EXPIRED;
    }
    if (msg.includes("forbidden") || msg.includes("403")) {
      return AUTH_ERRORS.UNAUTHORIZED;
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return PROJECT_ERRORS.PROJECT_NOT_FOUND;
    }
    if (msg.includes("network") || msg.includes("fetch")) {
      return NETWORK_ERRORS.CONNECTION_FAILED;
    }

    // Return the original message if it's already user-friendly (non-technical)
    if (!msg.includes("error") && !msg.includes("exception") && error.message.length < 100) {
      return error.message;
    }
  }

  return NETWORK_ERRORS.UNKNOWN;
}

/**
 * Format error for API response
 */
export function formatApiError(error: unknown, fallback: string = NETWORK_ERRORS.UNKNOWN) {
  const message = error instanceof Error ? getErrorMessage(error) : fallback;

  // Log the actual error for debugging
  console.error("[API Error]", error);

  return {
    success: false,
    error: message,
  };
}
