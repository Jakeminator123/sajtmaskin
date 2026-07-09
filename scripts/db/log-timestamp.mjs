/** UTC ISO + Europe/Stockholm local time for CLI log output. */
const LOCAL_TZ = "Europe/Stockholm";

const localTimeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: LOCAL_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * @param {Date | string | number | null | undefined} value
 * @returns {string} e.g. `2026-07-09T14:56:11Z (16:56 lokal)`
 */
export function formatLogTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const utc = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${utc} (${localTimeFmt.format(date)} lokal)`;
}

export const LOG_TIMESTAMP_NOTE = "Tider: UTC (lokal tid inom parentes)";
