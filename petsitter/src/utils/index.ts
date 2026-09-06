/*
 * formatDate used to live here, doing `new Date(dateStr)` on a 'YYYY-MM-DD'
 * string — which the spec says to parse as UTC midnight, so it rendered the
 * PREVIOUS day for everyone west of Greenwich. It had no importers left (every
 * screen already uses lib/dates' formatDate), so it was dead code with a live
 * landmine in it: the next person to reach for the obvious name in the obvious
 * place would have reintroduced a bug this codebase has already shipped once.
 * Deleted rather than fixed — one implementation, in lib/dates.ts.
 */

/**
 * Format a time string for display
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Validate an email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * A human-readable name for someone we only know by email address.
 *
 * `email.split('@')[0]` is not good enough: it surfaces plus-addressing and
 * separators verbatim — "tcdain+qapaws", "first.last" — which reads like a bug,
 * and quoting a stranger's full address into a shared feed is more of their
 * identity than the moment calls for. Returns '' when there is nothing usable,
 * so callers can fall back to their own wording.
 */
export function personNameFromEmail(email?: string | null): string {
  const local = email?.split('@')[0];
  if (!local) return '';
  const base = local.split('+')[0].replace(/[._-]+/g, ' ').trim();
  if (!base) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Truncate a string to a specified length
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * Strip all non-digit characters from a phone number
 * Returns just the digits for storage
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Format a phone number for display as (XXX) XXX-XXXX
 * Handles partial input for live formatting while typing
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);

  if (cleaned.length === 0) return '';
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
}

/**
 * Validate a phone number (must have 10 digits for US)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.length === 10;
}

/**
 * Format phone for storage (just digits, or formatted - your choice)
 * Using formatted for better readability in storage
 */
export function formatPhoneForStorage(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);
  if (cleaned.length !== 10) return phone; // Return as-is if not valid
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
}
