/**
 * The timezone the app's calendar lives in. The server runs on UTC, where the
 * next day (and on the 1st, the next month) starts at 21:00 in Buenos Aires.
 */
export const APP_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** Today as yyyy-MM-dd in the app's timezone. */
export function today(now: Date = new Date()): string {
  // en-CA formats dates as yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The current calendar month in the app's timezone. */
export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = today(now).split("-").map(Number);
  return { year, month };
}

/** A yyyy-MM-dd date `days` days later (earlier when negative). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The date a month's balances are valued at: its last day, or today while it runs. */
export function monthCloseDate(year: number, month: number, todayStr: string = today()): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return monthEnd < todayStr ? monthEnd : todayStr;
}
