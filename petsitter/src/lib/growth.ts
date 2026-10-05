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
 * QR code for SHEET_URL with a paw in the middle, generated once (qrcode
 * 1.5.4, error correction H so the code survives losing up to 30%; the paw
 * badge covers about 6%) and checked by decoding it back, full size and
 * shrunk and blurred. Inline SVG: it prints sharp at any size and
 * needs no network, which matters on a sheet meant for a house without signal.
 */
export const SHEET_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="82" height="82" role="img" aria-label="QR code: pawstructions.com" viewBox="0 0 39 39" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h39v39H0z"/><path stroke="#000000" d="M1 1.5h7m1 0h2m1 0h2m1 0h1m1 0h4m1 0h4m1 0h2m2 0h7M1 2.5h1m5 0h1m1 0h1m5 0h1m4 0h2m3 0h1m1 0h2m2 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m2 0h1m3 0h1m1 0h3m1 0h1m2 0h1m3 0h1m1 0h1m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h3m6 0h4m1 0h2m2 0h1m3 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m2 0h2m1 0h4m2 0h2m2 0h1m1 0h2m2 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h2m1 0h1m5 0h2m1 0h4m3 0h2m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 8.5h1m1 0h1m1 0h4m4 0h1m1 0h1M4 9.5h1m2 0h1m2 0h3m1 0h1m2 0h1m2 0h1m1 0h3m2 0h2m3 0h3m1 0h2M2 10.5h4m3 0h1m4 0h3m4 0h1m6 0h1m1 0h1m2 0h1m2 0h2M1 11.5h4m2 0h1m3 0h2m1 0h2m1 0h1m1 0h4m1 0h1m4 0h1m1 0h2m1 0h1m1 0h2M1 12.5h2m3 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h4m4 0h1m1 0h1m8 0h1M3 13.5h1m1 0h3m1 0h1m2 0h4m1 0h10m2 0h3m4 0h1M4 14.5h1m1 0h1m1 0h4m3 0h1m1 0h1m1 0h2m2 0h1m2 0h2m3 0h1m2 0h1m2 0h1M1 15.5h1m3 0h1m1 0h1m1 0h2m2 0h6m1 0h3m1 0h1m1 0h2m1 0h1m1 0h2m2 0h1m1 0h1M2 16.5h2m1 0h2m1 0h1m1 0h1m4 0h2m1 0h1m1 0h1m3 0h4m5 0h1m3 0h1M2 17.5h1m3 0h4m1 0h1m2 0h2m2 0h2m2 0h1m7 0h2m2 0h4M2 18.5h1m2 0h1m3 0h2m2 0h2m1 0h1m1 0h2m2 0h1m2 0h3m1 0h1m1 0h1m1 0h2m2 0h1M2 19.5h2m3 0h1m2 0h1m1 0h2m1 0h3m1 0h2m1 0h1m2 0h2m2 0h2m3 0h1m1 0h2M4 20.5h1m3 0h1m1 0h1m1 0h2m1 0h6m1 0h3m3 0h1m2 0h1m3 0h2M2 21.5h1m1 0h1m1 0h5m3 0h1m2 0h2m5 0h3m2 0h6m2 0h1M3 22.5h2m1 0h1m1 0h2m1 0h5m7 0h1m2 0h2m3 0h1m2 0h1m1 0h2M1 23.5h2m1 0h5m2 0h1m1 0h1m3 0h1m4 0h1m1 0h4m3 0h7M1 24.5h2m1 0h1m4 0h1m2 0h1m1 0h1m2 0h8m1 0h1m3 0h1m2 0h1M3 25.5h2m1 0h2m2 0h2m2 0h1m1 0h1m3 0h1m1 0h3m2 0h3m1 0h1m1 0h1M2 26.5h1m2 0h1m3 0h1m1 0h1m2 0h3m1 0h2m1 0h1m2 0h1m2 0h2m6 0h3M1 27.5h1m1 0h3m1 0h2m1 0h3m2 0h1m2 0h1m2 0h1m1 0h2m3 0h4m2 0h4M2 28.5h1m1 0h1m3 0h2m2 0h1m3 0h1m6 0h2m1 0h1m2 0h1m1 0h1m5 0h1M1 29.5h2m3 0h3m1 0h5m5 0h1m1 0h2m1 0h1m2 0h8m1 0h1M9 30.5h2m1 0h4m3 0h1m1 0h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h2M1 31.5h7m2 0h3m2 0h1m2 0h2m3 0h1m2 0h1m1 0h2m1 0h1m1 0h1m1 0h3M1 32.5h1m5 0h1m2 0h1m4 0h3m4 0h1m6 0h1m3 0h1m1 0h1M1 33.5h1m1 0h3m1 0h1m3 0h1m1 0h1m1 0h1m2 0h5m1 0h4m1 0h6m1 0h2M1 34.5h1m1 0h3m1 0h1m1 0h2m1 0h2m1 0h2m1 0h2m4 0h2m1 0h1m1 0h2m1 0h2m2 0h2M1 35.5h1m1 0h3m1 0h1m2 0h1m1 0h1m1 0h1m1 0h5m3 0h3m1 0h3m2 0h1m3 0h1M1 36.5h1m5 0h1m2 0h1m1 0h2m1 0h1m1 0h2m1 0h1m3 0h3m2 0h1M1 37.5h7m2 0h1m1 0h4m2 0h1m2 0h4m1 0h1m1 0h3m1 0h1m1 0h1m1 0h2"/><rect x="15.00" y="15.00" width="9" height="9" rx="1.98" fill="#ffffff"/><g fill="#3C6779" transform="translate(19.50 19.50) scale(0.9000)"><ellipse cx="0" cy="1.45" rx="2.25" ry="1.85"/><ellipse cx="-2.55" cy="-0.65" rx="0.95" ry="1.2" transform="rotate(-20 -2.55 -0.65)"/><ellipse cx="-0.95" cy="-2.35" rx="0.95" ry="1.25" transform="rotate(-8 -0.95 -2.35)"/><ellipse cx="0.95" cy="-2.35" rx="0.95" ry="1.25" transform="rotate(8 0.95 -2.35)"/><ellipse cx="2.55" cy="-0.65" rx="0.95" ry="1.2" transform="rotate(20 2.55 -0.65)"/></g></svg>`;

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
