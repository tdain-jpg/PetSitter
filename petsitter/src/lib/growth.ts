import { Platform } from 'react-native';
import { dataService } from '../services/SupabaseAdapter';

/**
 * Growth that comes from the product itself, and the bookkeeping that says
 * which part of it worked.
 *
 * Every outward link carries ?ref=<slug>: the QR code on a printed sheet
 * (sheet), a share link's footer (share), invitation emails (sitter_invite,
 * household_invite, owner_invite, trip_request), and anything Tim adds later
 * (facebook, vet_card...). The first ref a browser sees is kept; when that
 * browser creates an account, record_signup_source (0040) stores it once.
 */

const REF_KEY = 'pawstructions.ref';
const SLUG = /^[a-z0-9_]{1,32}$/;

/** The address the printed QR code points at, with its ref. */
export const SHEET_URL = 'https://pawstructions.com/?ref=sheet';

/**
 * QR code for SHEET_URL, generated once (qrcode 1.5.4, error correction M)
 * and checked by decoding it back. Inline SVG: it prints sharp at any size and
 * needs no network, which matters on a sheet meant for a house without signal.
 */
export const SHEET_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" role="img" aria-label="QR code: pawstructions.com" viewBox="0 0 31 31" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h31v31H0z"/><path stroke="#000000" d="M1 1.5h7m3 0h2m1 0h1m1 0h1m2 0h3m1 0h7M1 2.5h1m5 0h1m2 0h2m1 0h4m1 0h2m3 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m1 0h2m1 0h3m1 0h2m2 0h2m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h2m1 0h2m1 0h4m1 0h1m2 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h1m5 0h4m2 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h2m2 0h1m2 0h3m2 0h1m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h1m5 0h3m2 0h1M1 9.5h1m1 0h5m4 0h2m2 0h1m1 0h1m2 0h1m1 0h5M3 10.5h2m1 0h1m1 0h1m1 0h2m1 0h3m1 0h5m1 0h3m3 0h1M1 11.5h3m3 0h1m3 0h7m6 0h1M2 12.5h3m3 0h3m3 0h1m1 0h2m2 0h3m2 0h2m1 0h1M4 13.5h1m1 0h2m1 0h2m4 0h2m1 0h3m3 0h1m1 0h2M1 14.5h3m1 0h2m3 0h1m1 0h1m4 0h5m1 0h3m3 0h1M1 15.5h1m2 0h2m1 0h1m2 0h1m2 0h1m2 0h1m1 0h1m2 0h2m1 0h1m1 0h2M1 16.5h4m4 0h3m3 0h2m3 0h6m2 0h1M1 17.5h2m1 0h9m5 0h3m3 0h1m1 0h2M1 18.5h1m1 0h1m1 0h1m2 0h1m3 0h4m1 0h2m1 0h2m1 0h3m1 0h1m1 0h1M1 19.5h1m4 0h4m1 0h1m2 0h5m2 0h1m2 0h2m1 0h1M1 20.5h1m1 0h4m1 0h1m4 0h2m10 0h1m2 0h1M1 21.5h1m4 0h5m1 0h1m2 0h4m1 0h6m1 0h3M9 22.5h1m2 0h2m3 0h1m3 0h1m3 0h5M1 23.5h7m2 0h1m2 0h1m2 0h6m1 0h1m1 0h3M1 24.5h1m5 0h1m1 0h5m1 0h3m1 0h3m3 0h1m2 0h1M1 25.5h1m1 0h3m1 0h1m1 0h1m7 0h2m2 0h5m1 0h1M1 26.5h1m1 0h3m1 0h1m1 0h2m1 0h4m3 0h1m6 0h4M1 27.5h1m1 0h3m1 0h1m1 0h2m1 0h1m1 0h3m3 0h1m1 0h7M1 28.5h1m5 0h1m3 0h2m2 0h1m1 0h1m2 0h3m2 0h2m1 0h1M1 29.5h7m1 0h2m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h3"/></svg>`;

/** Call once at startup, before navigation can rewrite the address bar. */
export function captureReferral(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')?.toLowerCase().trim();
    if (!ref || !SLUG.test(ref)) return;
    // First touch wins: a later link must not rewrite where someone came from.
    if (window.localStorage.getItem(REF_KEY)) return;
    window.localStorage.setItem(REF_KEY, ref);
  } catch {
    // Storage blocked (private mode): attribution is a nicety, never a blocker.
  }
}

/**
 * After sign-in: hand the kept ref to the server, which records it only for a
 * brand-new account. Cleared either way, so it is sent at most once.
 */
export async function recordSignupSourceOnce(): Promise<void> {
  let ref: string | null = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      ref = window.localStorage.getItem(REF_KEY);
    } catch {
      ref = null;
    }
  }
  try {
    await dataService.recordSignupSource(ref);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(REF_KEY);
      } catch {
        // ignore
      }
    }
  } catch {
    // Keep the ref and try again next sign-in.
  }
}
