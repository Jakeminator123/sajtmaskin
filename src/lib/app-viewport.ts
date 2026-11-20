/**
 * Cookie-remsan (`CompactCookieBanner`) ligger fast i fönstrets nederkant och
 * skriver sin höjd till den här CSS-variabeln på `<html>` medan den syns.
 */
export const COOKIE_BANNER_HEIGHT_VAR = "--cookie-banner-h";

/**
 * Höjd för app-skal som fyller fönstret och scrollar inuti (startsidan,
 * buildern, /analys, /exempel, /teknik): fönstret minus cookie-remsan. Remsan
 * tar då egen plats i stället för att ligga över promptfältet eller komposern
 * (rigg V-05, SM-137). Utan remsa är variabeln osatt och höjden hela fönstret.
 */
export const APP_VIEWPORT_HEIGHT_CLASS =
  "h-[calc(100vh_-_var(--cookie-banner-h,0px))] supports-[height:100dvh]:h-[calc(100dvh_-_var(--cookie-banner-h,0px))]";
