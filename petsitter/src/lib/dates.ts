/**
 * Local-timezone helpers for the app's 'YYYY-MM-DD' date strings.
 *
 * Two UTC traps this module exists to close:
 *
 * 1. `new Date('2026-08-13')` is parsed by spec as UTC *midnight*, not local
 *    midnight. Anywhere west of UTC that instant is still the 12th, so
 *    `.toLocaleDateString()` renders the PREVIOUS day. Always go through
 *    `parseLocalDate`/`formatDate` instead of the Date string constructor.
 *
 * 2. `new Date().toISOString().split('T')[0]` stamps "today" in UTC. After
 *    ~5-7pm local a US user gets TOMORROW's date, so records land under the
 *    wrong day and read back as missing. Always use `todayLocal()`.
 *
 * Everything here is pure and dependency-free.
 */

/** Matches a syntactically well-formed 'YYYY-MM-DD' string (not yet a real date). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Locale used for display formatting, matching the rest of the app. */
const DISPLAY_LOCALE = 'en-US';

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Today's date as 'YYYY-MM-DD' in the user's LOCAL timezone.
 *
 * Built from getFullYear/getMonth/getDate — never `toISOString()`, which would
 * return tomorrow's date for users behind UTC late in the day.
 */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Parse a 'YYYY-MM-DD' string as LOCAL midnight.
 *
 * Uses the `Date(year, monthIndex, day)` constructor rather than the string
 * constructor, which would parse as UTC midnight and shift the day west of UTC.
 *
 * Returns null for empty, malformed, or non-existent dates (e.g. '2026-02-31').
 */
export function parseLocalDate(dateStr: string): Date | null {
  if (!isValidDateString(dateStr)) return null;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // The two-digit-year legacy behaviour of the Date constructor maps years
  // 0-99 into the 1900s; set it explicitly so '0099-01-01' stays in year 99.
  date.setFullYear(year, month - 1, day);
  return date;
}

/**
 * Format a 'YYYY-MM-DD' string for display in the local timezone.
 *
 * Returns '' for undefined, empty, or invalid input so callers can render the
 * result directly. Defaults to e.g. "Thu, Aug 13, 2026".
 */
export function formatDate(
  dateStr: string | undefined,
  opts: Intl.DateTimeFormatOptions = DEFAULT_FORMAT
): string {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString(DISPLAY_LOCALE, opts);
}

/**
 * True only for a real calendar date written as 'YYYY-MM-DD'.
 *
 * Rejects free text ('next Tuesday'), the wrong shape ('2026-8-13') and dates
 * that do not exist ('2026-02-31', which the Date constructor would silently
 * roll forward to March 3rd).
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || !ISO_DATE_RE.test(dateStr)) return false;

  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  // Round-trip through the local constructor: an overflowing day (Feb 31st)
  // rolls into the next month, so the parts will no longer match.
  const date = new Date(year, month - 1, day);
  date.setFullYear(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}
