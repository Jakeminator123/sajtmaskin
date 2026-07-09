/** UTC ISO + Europe/Stockholm local time for CLI log output. */
const LOCAL_TZ = "Europe/Stockholm";

const localTimeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: LOCAL_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const localDateFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: LOCAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * @param {Date | string | number | null | undefined} value
 * @returns {string} e.g. `2026-07-09T14:56:11Z (16:56 lokal)` — med lokalt
 * datum utsatt när UTC- och lokaldygnet skiljer sig (`2026-07-09T22:30:00Z
 * (2026-07-10 00:30 lokal)`).
 */
export function formatLogTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const utc = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  const localDate = localDateFmt.format(date);
  const sameDay = utc.startsWith(localDate);
  const local = sameDay ? localTimeFmt.format(date) : `${localDate} ${localTimeFmt.format(date)}`;
  return `${utc} (${local} lokal)`;
}

export const LOG_TIMESTAMP_NOTE = "Tider: UTC (lokal tid inom parentes)";
