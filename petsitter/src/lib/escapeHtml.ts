/**
 * Escape a value for safe interpolation into an HTML string.
 *
 * Replaces &, <, >, " and ' so user- or AI-supplied content cannot inject
 * markup. This matters most for the PDF export: on web the generated HTML is
 * written into a same-origin print window, so any unescaped content would
 * execute with full access to the app's origin (including the stored
 * Supabase session).
 */
export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
