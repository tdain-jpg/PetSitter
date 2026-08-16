// Edge Function: create-checkout-session
//
// Starts the Crown purchase: a $5 ONE-TIME payment that permanently unlocks
// premium features for a whole HOUSEHOLD. Stripe Checkout in `payment` mode —
// not a subscription, so no billing portal and no renewal date.
//
// The browser calls this via supabase.functions.invoke('create-checkout-session',
// { body: { householdId?, guideId? } }), so the platform's default JWT
// verification applies (verify_jwt = true, pinned in config.toml) and CORS must
// be handled.
//
// Contract (the UnlockCrown screen depends on these exact shapes):
//   POST { householdId?: string, guideId?: string }  with the user's Authorization header
//   200 { url: string }                  hosted Checkout URL — send the browser there.
//                                        May be an ALREADY-OPEN session for this
//                                        household rather than a new one; see
//                                        "one live Checkout Session" below.
//   400 { error: 'bad_request' }         malformed body/ids
//   400 { error: 'no_household' }        caller has no household to buy for
//   401 { error: 'unauthorized' }        missing/invalid Authorization
//   404 { error: 'household_not_found' } missing OR caller is not a member
//   409 { error: 'already_crowned' }     household already paid — do not charge twice
//   502 { error: 'stripe_failed' }       Stripe rejected the session create, OR a
//                                        checkout for this buyer is mid-flight and
//                                        could not be resolved — safe to retry.
//   503 { error: 'billing_not_configured' } no secret key, or no usable price
//
// householdId is optional: omitted, we resolve the caller's own primary
// household via my_primary_household(). guideId is optional and is accepted
// because the client still sends it, but it does NOT reach Stripe: nothing that
// varies between two attempts may enter the create call (see "the key is only
// as good as the parameters it names" below). It is logged, so support can tie
// a checkout back to the sheet the buyer started from.
//
// Security model:
//   * Membership is verified with is_household_member BEFORE any Stripe call.
//     Without that check, "unknown household" and "someone else's household"
//     would be distinguishable by whether a session got created — an existence
//     oracle for household ids. Both answers are 404 here.
//   * has_crown is membership-gated by design, so it is only meaningful after
//     the membership check above; it is used to refuse a second charge, never
//     to answer questions about a household the caller doesn't belong to.
//   * All queries run through a client built with the ANON key plus the
//     caller's own Authorization header, so RLS decides what the caller can
//     see. No service-role access in this function.
//   * client_reference_id + metadata are the ONLY channel by which the webhook
//     learns which household paid. They are set here, server-side, after the
//     membership check — the client never names the household that gets crowned.
//
// ONE LIVE CHECKOUT SESSION PER HOUSEHOLD (why this function is idempotent)
//   has_crown above is the only gate on charging twice, and it cannot be true
//   until the webhook lands — so EVERY checkout started before the first
//   delivery passes it. Open UnlockCrown on a phone and a laptop, tap Unlock on
//   both, complete both, and Crown (a permanent, per-household, $5 one-time
//   product) has been bought twice. The client-side guard is per-tab React
//   state and cannot see the other device. The server is the only party that
//   can, so it does, in two layers:
//
//   1. REUSE. Before creating anything we ask Stripe for this buyer's OPEN
//      Checkout Sessions and return the one whose client_reference_id is this
//      household. Reusing beats refusing: the user who genuinely lost their tab
//      still gets to pay, and an open session stays payable for its full 24h
//      life, so handing back the same URL is the correct answer and not a
//      consolation. Sessions are listed by the buyer's own email
//      (customer_details[email]) because Stripe offers no client_reference_id
//      filter; the household id is then matched in code, so a session is never
//      handed to someone outside the household it belongs to.
//
//   2. IDEMPOTENCY KEY. Layer 1 is a read followed by a write, so two TRULY
//      simultaneous requests both read "nothing open" and both create. The key
//      closes exactly that: `crown:<household>:<buyer>:<hour bucket>` is passed
//      to Stripe on create, and Stripe — not us — stores it atomically. The
//      loser of the race gets the WINNER'S session object replayed, same id,
//      same url, so both tabs send the browser to one Checkout and one
//      PaymentIntent can exist. If the second request arrives while the first
//      is still in flight Stripe answers 409 idempotency_key_in_use; we sleep
//      briefly and retry, by which time the cached response is there. The
//      bucket is an hour because the key only has to cover concurrency — layer
//      1 already covers reuse across hours — and a short window keeps a stuck
//      session from pinning a buyer to it.
//
//   THE KEY IS ONLY AS GOOD AS THE PARAMETERS IT NAMES. Stripe replays a key
//   only for a request whose parameters match the original ("The idempotency
//   layer compares incoming parameters to those of the original request and
//   errors if they're not the same"); anything else is refused, not served. So
//   key and parameters are kept in step in both directions:
//     * The BUYER is in the key, because the buyer is in the parameters
//       (customer_email, and the user_id in both metadata blocks). A key that
//       named only the household would collide with a second member of the same
//       household buying in the same hour, and hand them an error instead of a
//       checkout.
//     * The GUIDE is in neither. It used to ride in success_url/cancel_url,
//       which made every attempt started from a different sheet — or from
//       Settings, which carries no guide at all — a different request under one
//       key. That turned the commonest retry there is into a parameter
//       mismatch, and a mismatch is precisely the moment when a second session
//       must NOT be created. The return URL is therefore fixed. Buyers still
//       land on UnlockCrown and it still polls for the entitlement; what a web
//       return gives up is the deep link onward to the sheet they started from,
//       which is a cheap price for not charging them twice.
//   What one key covers is one household, one buyer, one hour — with parameters
//   that cannot vary inside it, so a repeat attempt is replayed, not refused.
//
//   AN IDEMPOTENCY ERROR IS NEVER ANSWERED WITH A SECOND SESSION. Whatever the
//   cause — the first request still in flight, or a parameter that genuinely
//   moved under a live key (the price secret edited mid-hour, say) — the error
//   is proof that a session for this buyer already exists or is being made. We
//   re-run layer 1 and return that session when it is open; otherwise we fail
//   with 502 and let the client retry. Creating an UNKEYED session at that
//   point, which is what this function used to do, throws the whole mechanism
//   away at the one moment it is load-bearing: a customer who has to tap Unlock
//   again costs us far less than a customer charged $5 twice.
//
//   WHAT CAN STILL PRODUCE TWO SESSIONS, stated plainly rather than implied:
//     * Two DIFFERENT members of the household buying in the same hour. Their
//       keys differ by design (above), and neither one's session is visible to
//       the other's email lookup. This is what shipped before, not a regression.
//     * Two truly simultaneous requests from ONE buyer that straddle an hour
//       boundary, so the keys differ and neither lookup can see the other's
//       session yet. Seconds of exposure per hour.
//     * A request that arrives in a LATER hour than a session that has already
//       been PAID but whose webhook has not landed — layer 1 only reuses OPEN
//       sessions, and a paid one is 'complete'. Inside that hour the same
//       buyer's key replays the original create's stored response, so they are
//       handed back the session they already paid for instead of a fresh one;
//       that covers the realistic gap between paying and grant_crown running,
//       and beyond an hour has_crown is normally true already.
//   All three end in a refundable duplicate rather than a lost sale.
//
// WHAT IS BEING SOLD IS CONFIGURATION, NEVER A LITERAL
//   Stripe's sandbox objects do not carry over to live mode: the live product
//   and price get different ids. Hardcoding either one would make going live a
//   CODE change and a redeploy, when it must be a secrets change. So both ids
//   are read from the environment, and the function refuses to sell rather than
//   guess. STRIPE_PRICE_ID is preferred and costs no API call; STRIPE_PRODUCT_ID
//   is a real fallback, not a courtesy — the product id is the one that is easy
//   to find in the dashboard, so we resolve its default_price when the price id
//   is missing or was filled in with something that is not a price.
//
// Secrets: STRIPE_SECRET_KEY, and STRIPE_PRICE_ID (price_...) or
// STRIPE_PRODUCT_ID (prod_...) — at least one of the two. Optional APP_URL
// overrides the return origin for test runs. SUPABASE_URL / SUPABASE_ANON_KEY
// are auto-provided by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

// Where Checkout sends the browser back. Hardcoded to production like notify's
// APP_URL; the env override exists so a test-mode purchase can be driven
// against a preview deployment without editing code.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://pawstructions.com';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Return URLs. React Navigation's web linking config names only the public
// routes, so Main-stack screens resolve at /Main/<ScreenName> with params as
// the query string — the same shape AICheatSheet already relies on when a
// reload restores it. UnlockCrown is the landing spot in both directions: on
// success it can poll for the entitlement (the webhook may land a beat after
// the redirect), and on cancel the user is back where they started.
//
// Takes NOTHING per-request on purpose. These strings are part of the create
// call, so anything that varies between two attempts by the same buyer breaks
// the idempotency key that stands between them and a second $5 charge. The
// guide is what this used to carry: on native the screen stays mounted and
// keeps its own guideId, and a hard web redirect gives it up rather than risk
// the duplicate.
function returnUrl(outcome: 'success' | 'cancelled'): string {
  return `${APP_URL}/Main/UnlockCrown?checkout=${outcome}`;
}

// ----------------------------------------------------------------------------
// One live Checkout Session per household — see the header for the why
// ----------------------------------------------------------------------------
// An hour. The key only has to cover CONCURRENCY (reuse across longer spans is
// layer 1's job), and a short window means a session that somehow became
// unusable — a price that was wrong when it was minted, say — pins the buyer
// for at most an hour rather than the key's full 24h lifetime.
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000;

// The buyer is named as well as the household because the buyer is IN the
// create parameters, and Stripe only replays a key for parameters that match
// (see the header). Both halves are opaque uuids, which is also what Stripe
// asks for — its guidance is to keep personal identifiers such as email
// addresses out of idempotency keys.
function checkoutIdempotencyKey(householdId: string, userId: string): string {
  const bucket = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS);
  return `crown:${householdId}:${userId}:${bucket}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Layer 1: the household's already-open session, if it has one. Stripe has no
// client_reference_id filter on this endpoint, so we narrow by the buyer's own
// email and match the household in code — which also means a session can never
// be handed to someone whose email did not create it.
//
// Best-effort ON PURPOSE: every failure here is logged and read as "nothing
// open". A deduplication lookup that cannot answer must not be allowed to block
// a sale — the worst case of guessing wrong is the duplicate session layer 2
// then catches, while the worst case of failing hard is a customer who cannot
// pay us at all.
async function openSessionUrlFor(
  stripe: Stripe,
  householdId: string,
  email?: string
): Promise<string | null> {
  if (!email) return null;
  try {
    // status:'open' is what makes this safe to return: an expired or completed
    // session is never 'open', so a reused url is always still payable.
    const open = await stripe.checkout.sessions.list({
      status: 'open',
      customer_details: { email },
      limit: 20,
    });
    const match = open.data.find(
      (s) => s.client_reference_id === householdId && typeof s.url === 'string'
    );
    return match?.url ?? null;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `open-session lookup failed for household ${householdId} (continuing): ${detail.slice(0, 500)}`
    );
    return null;
  }
}

// Stripe reports both idempotency conditions as API type 'idempotency_error',
// and they need different handling:
//   'in_use'   — code idempotency_key_in_use, HTTP 409. The first request is
//                still in flight. A retry gets its cached response, which is
//                exactly the session we want.
//   'conflict' — the key is already bound to a COMPLETED request with different
//                parameters. No retry can change that answer.
//
// Read off `rawType`, NOT `type`: stripe-node overwrites `type` with the name of
// the error CLASS it chose — 'StripeIdempotencyError' for the 400, and
// 'StripeAPIError' for the 409, because its class mapping only looks for
// idempotency errors on 400/404 — and keeps the API's own type on `rawType`.
// Matching on `type` therefore never fires, which is why every idempotency
// error used to fall through to a bare 502. `raw.type` is the same value
// straight off the wire, checked in case a future SDK stops setting rawType.
function idempotencyFailure(err: unknown): 'in_use' | 'conflict' | null {
  const e = err as
    | {
        rawType?: unknown;
        code?: unknown;
        statusCode?: unknown;
        raw?: { type?: unknown };
      }
    | null
    | undefined;
  const apiType = e?.rawType ?? e?.raw?.type;
  if (apiType !== 'idempotency_error') return null;
  return e?.code === 'idempotency_key_in_use' || e?.statusCode === 409
    ? 'in_use'
    : 'conflict';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json(401, { error: 'unauthorized' });
  }

  // An empty body is legitimate (Settings → Unlock, no guide in hand), so a
  // parse failure only matters when a body was actually sent.
  let householdId: string | undefined;
  let guideId: string | undefined;
  try {
    const raw = await req.text();
    if (raw.length > 0) {
      const body = JSON.parse(raw);
      if (body?.householdId != null) householdId = String(body.householdId);
      if (body?.guideId != null) guideId = String(body.guideId);
    }
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (householdId != null && !UUID_RE.test(householdId)) {
    return json(400, { error: 'bad_request' });
  }
  // A malformed guideId is not worth failing a purchase over — it only feeds a
  // log line — so drop it rather than 400.
  if (guideId != null && !UUID_RE.test(guideId)) {
    guideId = undefined;
  }

  // Checked before any work: without a key and at least one way to name the
  // price there is nothing to sell, and no query below can change that.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const configuredPrice = Deno.env.get('STRIPE_PRICE_ID');
  const configuredProduct = Deno.env.get('STRIPE_PRODUCT_ID');
  if (!stripeKey || (!configuredPrice && !configuredProduct)) {
    console.error(
      'billing not configured — set STRIPE_SECRET_KEY, plus STRIPE_PRICE_ID (price_...) or STRIPE_PRODUCT_ID (prod_...), in Supabase → Edge Functions → Secrets'
    );
    return json(503, { error: 'billing_not_configured' });
  }

  // User-scoped client: the ANON key plus the caller's Authorization header,
  // so every query below runs under the caller's RLS.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  // The platform already verified the JWT; this resolves it to the user id and
  // email that go into the session metadata.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json(401, { error: 'unauthorized' });
  }

  // No household named: buy for the caller's own primary household.
  // my_primary_household() is caller-scoped (it only ever resolves auth.uid()),
  // so this cannot be steered at someone else's household.
  if (householdId == null) {
    const { data: primary, error: primaryError } = await supabase.rpc(
      'my_primary_household'
    );
    if (primaryError) {
      console.error('my_primary_household failed:', primaryError.message);
      return json(500, { error: 'internal' });
    }
    if (typeof primary !== 'string' || primary.length === 0) {
      return json(400, { error: 'no_household' });
    }
    householdId = primary;
  }

  // Membership gate. "Not a member" and "does not exist" must be one answer.
  const { data: isMember, error: memberError } = await supabase.rpc(
    'is_household_member',
    { h: householdId }
  );
  if (memberError) {
    console.error('is_household_member failed:', memberError.message);
    return json(500, { error: 'internal' });
  }
  if (isMember !== true) {
    return json(404, { error: 'household_not_found' });
  }

  // Crown is permanent and per-household: a second purchase buys nothing and
  // earns a refund request. Stop before Stripe ever sees the request.
  const { data: hasCrown, error: crownError } = await supabase.rpc('has_crown', {
    h: householdId,
  });
  if (crownError) {
    console.error('has_crown failed:', crownError.message);
    return json(500, { error: 'internal' });
  }
  if (hasCrown === true) {
    return json(409, { error: 'already_crowned' });
  }

  // No apiVersion pinned: the SDK ships with a version it is built against,
  // and hardcoding a date string here only creates a way for the two to drift.
  // createFetchHttpClient is required — the default Node http client does not
  // exist on Deno Edge.
  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Layer 1 of the double-charge guard (see header). Before the price lookup,
  // because a household that already has a live session needs neither a price
  // nor a second PaymentIntent — it needs the session it already has.
  const existingUrl = await openSessionUrlFor(
    stripe,
    householdId,
    user.email ?? undefined
  );
  if (existingUrl) {
    console.log(
      `reusing the open checkout session for household ${householdId}`
    );
    return json(200, { url: existingUrl });
  }

  // Resolve what to charge for. Done here, after the membership and has_crown
  // gates, so a request that was never going to reach Checkout does not spend a
  // Stripe round trip.
  let priceId: string | null = null;
  if (configuredPrice?.startsWith('price_')) {
    priceId = configuredPrice;
  } else {
    // Pasting the PRODUCT id where the PRICE id belongs is the easy mistake to
    // make in the Stripe dashboard, and Stripe's own error for it is opaque.
    // Say so plainly — then recover through the product route instead of
    // failing a sale over which of two ids landed in which secret. Neither id
    // is a secret, so logging them is safe and makes the fix obvious.
    if (configuredPrice) {
      console.error(
        `STRIPE_PRICE_ID is "${configuredPrice}", which is not a price id (price_...) — ignoring it and resolving the product's default price instead`
      );
    }
    const productId = configuredProduct?.startsWith('prod_')
      ? configuredProduct
      : configuredPrice?.startsWith('prod_')
        ? configuredPrice
        : null;
    if (!productId) {
      console.error(
        'no usable price: STRIPE_PRICE_ID must be a price_... id, or STRIPE_PRODUCT_ID a prod_... id'
      );
      return json(503, { error: 'billing_not_configured' });
    }
    try {
      const product = await stripe.products.retrieve(productId);
      const defaultPrice =
        'default_price' in product ? product.default_price : null;
      priceId =
        typeof defaultPrice === 'string'
          ? defaultPrice
          : defaultPrice?.id ?? null;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(
        `could not retrieve stripe product ${productId}: ${detail.slice(0, 500)}`
      );
      return json(503, { error: 'billing_not_configured' });
    }
    if (!priceId) {
      // A product with no default price cannot be charged for. Naming both fixes
      // matters: whoever reads this log has a dashboard open, not this file.
      console.error(
        `stripe product ${productId} has no default price — set one on the product, or configure STRIPE_PRICE_ID directly`
      );
      return json(503, { error: 'billing_not_configured' });
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id AND metadata carry the same household id: the
    // webhook reads client_reference_id first, and metadata keeps the pair
    // visible in the dashboard next to a payment. user_id records WHO bought
    // it — the entitlement itself belongs to the household, not the buyer.
    // client_reference_id is also what layer 1 matches on when it decides
    // whether an open session belongs to this household.
    client_reference_id: householdId,
    metadata: { household_id: householdId, user_id: user.id },
    // Mirrored onto the PaymentIntent so a refund or dispute opened from the
    // Stripe dashboard still shows a human which household it belongs to. The
    // webhook does not trust it for reversals — it traces the PaymentIntent
    // back to this session and reads the household off our own ledger.
    payment_intent_data: {
      metadata: { household_id: householdId, user_id: user.id },
    },
    customer_email: user.email ?? undefined,
    // Fixed strings, deliberately: see returnUrl. Every field in this object is
    // now constant for one household + one buyer + one price, which is exactly
    // what the key below promises Stripe.
    success_url: returnUrl('success'),
    cancel_url: returnUrl('cancelled'),
  };

  // Layer 2 of the double-charge guard (see header). Every request from this
  // buyer for this household in this hour presents the same key AND the same
  // parameters, so Stripe — atomically, on its side, which is the only place a
  // race between two of our isolates can be settled — creates at most one
  // session and replays that same session, id and url alike, to whoever asked
  // second.
  const idempotencyKey = checkoutIdempotencyKey(householdId, user.id);

  let session: Stripe.Checkout.Session | null = null;
  for (let attempt = 0; attempt < 3 && session === null; attempt++) {
    try {
      session = await stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey,
      });
    } catch (err) {
      const failure = idempotencyFailure(err);

      // The winner of the race has not finished writing its response yet. Wait
      // it out: the retry is served the cached session, which IS the goal.
      if (failure === 'in_use' && attempt < 2) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (failure !== null) {
        // The key is spoken for, so a session for this buyer already exists —
        // or is still being created — this hour. Return THAT one. A rival
        // session, keyed or unkeyed, is a second $5 charge for a product this
        // household can only own once, so it is never the answer here.
        const raced = await openSessionUrlFor(
          stripe,
          householdId,
          user.email ?? undefined
        );
        if (raced) {
          console.log(
            `returning the checkout session that already holds the key for household ${householdId}`
          );
          return json(200, { url: raced });
        }

        // Nothing open to hand back, and both remaining cases resolve on their
        // own rather than by us creating anything:
        //   'in_use'   — the other request is STILL IN FLIGHT and may be about
        //     to produce the very session we would be duplicating.
        //   'conflict' — the key is bound to a FINISHED create whose parameters
        //     differ. With the buyer in the key and the guide out of the
        //     parameters that means something genuinely moved under us mid-hour
        //     (the price secret rewritten, the account's email changed) — or
        //     the session it made is already PAID and therefore no longer
        //     'open', in which case the entitlement is seconds away.
        // Either way the next attempt, or the next hour bucket, gets a clean
        // answer. Fail loudly and let the client retry.
        console.error(
          `checkout idempotency key for household ${householdId} is held (${failure}) and no open session is visible for user ${user.id}`
        );
        return json(502, { error: 'stripe_failed' });
      }

      const detail = err instanceof Error ? err.message : String(err);
      console.error(`stripe session create failed: ${detail.slice(0, 500)}`);
      return json(502, { error: 'stripe_failed' });
    }
  }

  // Narrowing for the compiler rather than a live branch: every path out of the
  // loop above either assigns `session` or returns. Kept as a 502 so a future
  // edit that does fall through fails loudly instead of dereferencing null.
  if (!session) {
    console.error(
      `no checkout session produced for household ${householdId}`
    );
    return json(502, { error: 'stripe_failed' });
  }

  // Hosted Checkout always returns a url; a null one would mean the session was
  // created in a mode the client can't use, which is a failure, not a success.
  if (!session.url) {
    console.error(`stripe session ${session.id} has no url`);
    return json(502, { error: 'stripe_failed' });
  }

  // The guide cannot ride in the session itself (see returnUrl), so this line is
  // the only place a checkout can still be tied back to the sheet the buyer was
  // looking at when they tapped Unlock.
  console.log(
    `checkout session ${session.id} ready for household ${householdId}` +
      (guideId ? ` (started from guide ${guideId})` : '')
  );
  return json(200, { url: session.url });
});
