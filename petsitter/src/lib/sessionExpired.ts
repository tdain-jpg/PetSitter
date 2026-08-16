import { supabase } from './supabase';

/**
 * Answers one question: is the user's sign-in actually dead, or did that
 * request just fail?
 *
 * The failure this exists to catch is an auth failure that lands AFTER mount.
 * The app was already rendering a signed-in Home, so nothing routed the user
 * anywhere; the loads simply came back empty and Home drew "Welcome, <name>!"
 * over 0 Pets, 0 Guides and the "Add your first pet" empty state — pixel
 * identical to a wiped account. Nothing had been lost, but the user had every
 * reason to believe otherwise.
 *
 * Why a server probe and not a look at the error: SupabaseAdapter flattens
 * every failure to `new Error(error.message)`, so by the time DataContext sees
 * it the HTTP status is gone and only a string is left. Those strings vary by
 * cause — PostgREST says "JWT expired", while an expired token downgraded to
 * the anon role produces "permission denied for function my_pending_invites",
 * and a future Postgres release is free to word either differently. Matching
 * on them would fail silently and land us right back in the empty-but-happy
 * dashboard. The auth server is the only authority, so we ask it.
 */

/**
 * Distinguishes "the server rejected this login" from "we could not reach the
 * server".
 *
 * supabase-js reports a network failure as AuthRetryableFetchError with status
 * 0, while a genuine rejection carries the status the auth API returned. That
 * gap is the whole safety margin here: treating an offline moment as a dead
 * session would throw people out of the app every time a train enters a
 * tunnel, so anything that is not a clear 4xx is read as "we don't know".
 */
function serverRejectedLogin(error: unknown): boolean {
  const status = (error as { status?: number } | null | undefined)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

async function probeSession(): Promise<boolean> {
  try {
    // Local first, and cheap: getSession refreshes an expired access token if
    // it can, so reaching this point with no session means supabase-js has
    // already given up on the login.
    const { data, error } = await supabase.auth.getSession();
    if (error) return serverRejectedLogin(error);
    if (!data.session) return true;

    // A token that exists is not necessarily a token the server still honours
    // — a revoked refresh token or a deleted user both look fine locally.
    // getUser is the round trip that settles it.
    const probe = await supabase.auth.getUser();
    if (probe.error) return serverRejectedLogin(probe.error);
    return !probe.data.user;
  } catch (err) {
    // If we could not ask, we do not get to conclude. Fall through to the
    // ordinary error handling, which shows a load error rather than claiming
    // the user has been signed out.
    console.error('Could not check whether the sign-in is still valid:', err);
    return false;
  }
}

/**
 * In-flight probe, shared by every caller.
 *
 * A cold start fires five loads at once, and a dead session fails all five
 * within milliseconds of each other. Without this they would each open their
 * own round trip to ask the identical question.
 */
let inFlightProbe: Promise<boolean> | null = null;

/**
 * True only when the current sign-in is confirmed dead. False for a network
 * blip, a server error, or any failure we could not attribute — callers must
 * be able to treat `true` as grounds for telling the user they are signed out.
 */
export function confirmSessionLost(): Promise<boolean> {
  if (!inFlightProbe) {
    // Cleared on settle, not cached: a load that fails an hour from now
    // deserves a fresh answer, not this one.
    inFlightProbe = probeSession().finally(() => {
      inFlightProbe = null;
    });
  }
  return inFlightProbe;
}
