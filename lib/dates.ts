// Small, reusable, timezone-safe calendar-date helpers.
//
// Postgres `date` columns come back to JS as plain "YYYY-MM-DD" strings with
// no time component (see lib/brain-mappers.ts). `new Date("YYYY-MM-DD")`
// parses that string as UTC midnight, while `new Date()` ("now") is local
// time — in timezones behind UTC (e.g. Phoenix, UTC-7) this introduces a
// multi-hour skew that can misclassify tasks created/completed near a day
// boundary. To avoid this entirely, every helper here works with
// "YYYY-MM-DD" strings and LOCAL date parts, never parsing a date-only
// string through the `Date` constructor for comparison purposes. ISO date
// strings ("YYYY-MM-DD") sort lexicographically in the same order as they
// sort chronologically, so plain string comparison is both correct and
// simpler than any Date-based arithmetic.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Formats a Date's LOCAL date parts as "YYYY-MM-DD".
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Returns the Monday and Sunday ("YYYY-MM-DD") of `reference`'s ISO week
// (default: now), computed from local date parts.
export function isoWeekRange(reference: Date = new Date()): { startDate: string; endDate: string } {
  const monday = new Date(reference);
  const day = monday.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {
    startDate: toLocalDateString(monday),
    endDate: toLocalDateString(sunday),
  };
}

// Inclusive membership test for a date value within ["YYYY-MM-DD" startDate,
// "YYYY-MM-DD" endDate]. `dateStr` may be a plain "YYYY-MM-DD" string, a full
// ISO timestamp string (e.g. Neon `date` columns can arrive as
// "2026-07-12T07:00:00.000Z" — local midnight expressed as UTC), or a Date
// object. Only the first 10 characters (the "YYYY-MM-DD" date part) are
// compared lexicographically — no full Date parsing, so no UTC/local skew is
// possible, and a timestamp on the boundary date is correctly included.
export function isDateWithin(
  dateStr: string | Date | null | undefined,
  startDate: string,
  endDate: string
): boolean {
  if (!dateStr) return false;
  const datePart = dateStr instanceof Date ? dateStr.toISOString().slice(0, 10) : String(dateStr).slice(0, 10);
  return datePart >= startDate && datePart <= endDate;
}

// Returns the inclusive start date and exclusive end date of a calendar
// month given as "YYYY-MM". Handy for reports that window by month rather
// than by ISO week (e.g. an upcoming Monthly Summary feature).
export function monthRange(month: string): { startDate: string; endDateExclusive: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr); // 1-12

  const startDate = `${yearStr}-${monthStr}-01`;
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
  const nextYear = monthNum === 12 ? year + 1 : year;
  const endDateExclusive = `${nextYear}-${pad2(nextMonth)}-01`;

  return { startDate, endDateExclusive };
}
