/**
 * Format a date string for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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
