// Edge Function: stripe-webhook
//
// Receives Stripe events, grants Crown when a $5 one-time Checkout payment
// completes, and takes it back when that payment is reversed. Called ONLY by
// Stripe — never by the client, never by the app.
//
// DEPLOYMENT NOTE: deploy with JWT verification DISABLED
// (supabase functions deploy stripe-webhook --no-verify-jwt, or
// verify_jwt = false — pinned in config.toml). Stripe cannot present a Supabase
// JWT; authentication IS the Stripe-Signature HMAC verified below, exactly as
// notify's authentication is the x-cron-secret header. Nothing in the request
// body is trusted until that signature checks out.
//
// Contract:
//   POST <raw Stripe event body> with header 'Stripe-Signature'
//   200 { received: true, ... }         handled, or deliberately ignored
//   400 { error: 'missing_signature' }  no Stripe-Signature header
//   400 { error: 'invalid_signature' }  HMAC did not verify — not from Stripe
//   405 { error: 'method_not_allowed' }
//   409 { error: 'grant_not_recorded_yet' }
//                                       a reversal outran its own grant — Stripe
//                                       MUST retry until that grant lands
//   500 { error: 'internal' }           transient — Stripe SHOULD retry
//   503 { error: 'not_configured' }     STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET unset
//
// EVENTS HANDLED
//   checkout.session.completed / .async_payment_succeeded  → grant_crown
//   charge.refunded (full) / charge.dispute.closed (lost)  → revoke_crown
//   anything else                                          → 200, ignored
//
// Status codes are a control channel here, not decoration. Stripe retries any
// non-2xx for up to ~3 days, so:
//   * events we don't care about return 200 (a 4xx would have Stripe retrying
//     an event we will never handle, forever, until the endpoint auto-disables);
//   * events we cannot ever process — a malformed household id, a session with
//     no household attached, a payment whose household has since been deleted,
//     a reversal of a charge that never had a Checkout session at all — also
//     return 200, because a retry cannot fix them. Those log loudly rather than
//     quietly: money moved, and a human has to finish the job by hand;
//   * a reversal whose sale is missing from the ledger is the one case that
//     LOOKS unprocessable and is not: Stripe orders nothing, so the grant for
//     that same session may still be in flight. That answers 409 and leans on
//     the retries until the grant lands — for a bounded window, after which it
//     gives up loudly; see REVERSAL_RETRY_WINDOW_S;
//   * only genuinely transient failures (an RPC erroring, a Stripe API blip)
//     return 500, so Stripe's retries become our recovery path.
//
// DENO GOTCHA (this will silently cost you an afternoon): you MUST use
// `await stripe.webhooks.constructEventAsync(...)` with the SubtleCrypto
// provider. The synchronous constructEvent() reaches for Node's crypto module
// and throws on Edge, so every real event would fail signature verification.
//
// DEPENDENCY on migration 0012 — grant_crown must exist with this exact
// signature. PostgREST resolves an RPC BY ARGUMENT NAME, so a renamed parameter
// is not a type error, it is PGRST202 "could not find the function":
//   grant_crown(p_household uuid,
//               p_source    text,
//               p_event     text,
//               p_session   text default null,
//               p_amount    int  default null,
//               p_currency  text default null) returns boolean
// It inserts crown_purchases (stripe_event_id UNIQUE — that uniqueness is the
// idempotency key that makes Stripe's retries a no-op), sets crown_until to the
// permanent sentinel with crown_source = p_source, and returns false instead of
// raising when p_event was already recorded.
//
// p_source is the caller's to state, and this file always passes 'stripe'. It
// is a parameter rather than a constant inside grant_crown because the same
// function records founder and promo grants, which are exactly the grants a
// refund must NOT be assumed against.
//
// DEPENDENCY on migration 0013 — revoke_crown, same argument-name discipline:
//   revoke_crown(p_household uuid,
//                p_reason    text,
//                p_event     text,
//                p_session   text default null) returns boolean
// p_event is the Stripe event id and is again the idempotency key, so a
// redelivered refund revokes once.
//
// p_session names WHICH sale is being unwound, and this file always passes it.
// A household can hold two grants; omitting p_session makes revoke_crown fall
// back to the oldest unreversed grant, and the reversal's reversed_purchase
// link is UNIQUE, so a reversal bound to the wrong sale can never be
// re-pointed. That means the four-argument shape is required: apply 0013 before
// deploying this function, or the RPC answers PGRST202 and refunds revoke
// nothing.
//
// It returns FALSE rather than raising for the ordinary no-ops — a redelivered
// event, or a sale an earlier event already reversed — so the returned boolean,
// not merely the absence of an error, is what says a revocation happened.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Supabase → Edge Functions
// → Secrets). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided by
// the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Web Crypto signature verification. Created once at module scope — it is
// stateless and reused across invocations.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// How long a reversal may keep demanding retries while the sale it unwinds is
// still missing from the ledger (see handleReversal).
//
// Measured against event.created — the instant STRIPE minted the event, which
// stays fixed across redeliveries. Each delivery attempt is re-signed with its
// own fresh Stripe-Signature timestamp, so constructEventAsync's 5-minute
// tolerance never fights this clock; an hours-old event still verifies.
//
// 24h is far longer than the seconds-to-minutes of ordinary out-of-order
// delivery, and long enough to cover a grant stuck in its own retry schedule
// behind a database outage. It is deliberately SHORTER than Stripe's ~3-day
// window: past this point the grant is not coming, and an event that fails for
// three straight days drags the endpoint's failure rate toward auto-disable
// while every other event is being handled fine.
const REVERSAL_RETRY_WINDOW_S = 24 * 60 * 60;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Service-role client: this function is trusted infrastructure (guarded by the
// signature check in the handler), has no user JWT to run under, and both
// granting and revoking an entitlement are by design privileged writes that no
// API role can make. crown_purchases is likewise readable only from here.
function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Refund and chargeback handling. The public Refund Policy promises the
// household returns to the free tier, so these events cannot sit in the
// "ignored" bucket — the entitlement has to come back off.
//
// HOW THE HOUSEHOLD IS RESOLVED, AND WHY NOT FROM THE PAYLOAD
//   A refund issued from the Stripe dashboard carries whatever metadata the
//   charge happened to have, and a charge created outside our checkout flow has
//   none at all — so the reversal payload is not a trustworthy answer to "which
//   household?". Our own ledger is. The charge (or dispute) names its
//   PaymentIntent, the PaymentIntent names the Checkout Session that created it
//   (checkout.sessions.list({ payment_intent })), and that session id is the one
//   we wrote to crown_purchases.checkout_session_id when we granted. The
//   household on that row is, by construction, the household that got Crown for
//   this money — the only household a refund of it may take Crown away from.
async function handleReversal(
  event: Stripe.Event,
  stripe: Stripe
): Promise<Response> {
  let paymentIntentId: string | null = null;
  let reason: string;

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    // charge.refunded also fires for a PARTIAL refund (a goodwill dollar or
    // two). Only a full refund unwinds the sale, so anything less leaves Crown
    // alone rather than silently confiscating a product that is still mostly
    // paid for — a human can revoke by hand if that is what was meant.
    if (!charge.refunded) {
      console.log(
        `event ${event.id}: partial refund on charge ${charge.id} (${charge.amount_refunded} of ${charge.amount}) — Crown left in place`
      );
      return json(200, { received: true, ignored: 'partial_refund' });
    }
    paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    reason = 'refund';
  } else {
    const dispute = event.data.object as Stripe.Dispute;
    // charge.dispute.closed fires for every outcome. Won and warning_closed
    // mean the money stayed with us, so only 'lost' costs the household Crown.
    if (dispute.status !== 'lost') {
      console.log(
        `event ${event.id}: dispute ${dispute.id} closed as ${dispute.status} — Crown unchanged`
      );
      return json(200, { received: true, ignored: `dispute_${dispute.status}` });
    }
    paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id ?? null;
    // 'chargeback', not 'dispute_lost': 0013 names refund/chargeback as the
    // ledger's reason vocabulary, and reason is read by humans reconciling it.
    reason = 'chargeback';
  }

  if (!paymentIntentId) {
    console.error(
      `event ${event.id}: ${reason} carries no payment intent — cannot resolve a household, nothing revoked`
    );
    return json(200, { received: true, ignored: 'no_payment_intent' });
  }

  let sessionIds: string[];
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 10,
    });
    sessionIds = sessions.data.map((s) => s.id);
  } catch (err) {
    // A Stripe API failure here really is transient (rate limit, blip), so this
    // is one of the few branches on the reversal path that earns a retry.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `event ${event.id}: could not list sessions for ${paymentIntentId}: ${detail.slice(0, 300)}`
    );
    return json(500, { error: 'internal' });
  }

  if (sessionIds.length === 0) {
    console.error(
      `event ${event.id}: ${reason} on ${paymentIntentId} has no Checkout session — not one of our purchases, nothing revoked`
    );
    return json(200, { received: true, ignored: 'no_session' });
  }

  const supabase = serviceClient();

  // More than one ledger row can share a session id (0012 leaves
  // checkout_session_id non-unique on purpose, so completed and
  // async_payment_succeeded can both be recorded). Every such row names the
  // same household, so the first match is the answer — and that row's
  // checkout_session_id is the sale this reversal unwinds, which is what
  // p_session pins below.
  const { data: purchases, error: lookupError } = await supabase
    .from('crown_purchases')
    .select('household_id, checkout_session_id')
    .in('checkout_session_id', sessionIds)
    .limit(1);
  if (lookupError) {
    console.error(
      `event ${event.id}: crown_purchases lookup failed for ${sessionIds.join(', ')}: ${lookupError.message}`
    );
    return json(500, { error: 'internal' });
  }

  const purchase = purchases?.[0] ?? null;

  // NO LEDGER ROW YET IS NOT THE SAME AS NOT ONE OF OUR PURCHASES.
  //
  // Stripe guarantees delivery, not order. A refund issued moments after
  // checkout — or a grant still working through ITS retries after a database
  // outage — puts charge.refunded here BEFORE the checkout.session.completed
  // that records the sale. Answering 200 would retire the reversal for good and
  // let that grant land afterwards unopposed: a fully refunded household holding
  // permanent Crown, and a ledger claiming revenue we handed back.
  //
  // So this asks to be sent again instead, and the reversal lands after the
  // grant. 409 rather than 500 because nothing is broken — it keeps an ordering
  // wait legible in Stripe's event log and out of any 5xx alerting; Stripe
  // retries every non-2xx alike.
  //
  // Bounded by the event's own age, since Stripe sends no attempt count. Once
  // the event is older than REVERSAL_RETRY_WINDOW_S the grant is not coming —
  // a test charge, a payment predating this webhook, or a session whose grant
  // was refused for carrying no household — and we stop failing. A reversal is
  // what gets dropped there, so it is not dropped quietly: the give-up logs
  // MANUAL REVOKE NEEDED with the ids a human needs, and if a grant does land
  // after that, only a human will take it back.
  if (!purchase) {
    const ageSeconds = Math.floor(Date.now() / 1000) - event.created;
    if (ageSeconds < REVERSAL_RETRY_WINDOW_S) {
      console.error(
        `event ${event.id}: ${reason} on ${paymentIntentId} has no crown_purchases row for session(s) ${sessionIds.join(', ')} yet (event is ${ageSeconds}s old) — asking Stripe to redeliver until the grant lands`
      );
      return json(409, { error: 'grant_not_recorded_yet' });
    }
    console.error(
      `MANUAL REVOKE NEEDED — event ${event.id}: ${reason} on ${paymentIntentId} still ` +
        `matches no crown_purchases row ${ageSeconds}s after the event was created ` +
        `(session(s) ${sessionIds.join(', ')}); giving up on redelivery. If Crown was ` +
        `ever granted for this money, it is still standing and must be revoked by hand`
    );
    return json(200, { received: true, ignored: 'no_purchase' });
  }

  // The sale IS recorded, but its row names no household: the household (or the
  // account behind it) was deleted and 0012's ON DELETE SET NULL blanked the
  // link. The entitlement went with the household, there is nothing left to take
  // back, and no redelivery will re-attach an id.
  const householdId = purchase.household_id;
  if (!householdId || !UUID_RE.test(householdId)) {
    console.error(
      `event ${event.id}: ${reason} on ${paymentIntentId} matches a crown_purchases row with no usable household — nothing revoked`
    );
    return json(200, { received: true, ignored: 'household_gone' });
  }

  // The sale being unwound, named exactly. Passing it is what makes revoke_crown
  // reverse THIS purchase instead of falling back to the household's oldest
  // unreversed grant — a distinction that matters for a household holding two
  // grants, and one that cannot be corrected later because reversed_purchase is
  // UNIQUE. The row was matched ON checkout_session_id, so the value is non-null
  // by construction; the `?? null` only narrows the column's nullable type, and
  // would degrade to that oldest-grant fallback rather than to nonsense.
  const sessionId = purchase.checkout_session_id ?? null;

  const { data: revoked, error: revokeError } = await supabase.rpc(
    'revoke_crown',
    {
      p_household: householdId,
      p_reason: reason,
      p_event: event.id,
      p_session: sessionId,
    }
  );
  if (revokeError) {
    // Same unretryable case as the grant path: the household is gone, so there
    // is no entitlement left to remove and the refund has already done its job.
    if (revokeError.code === '23503') {
      console.error(
        `event ${event.id}: household ${householdId} no longer exists — ${reason} needs no revoke`
      );
      return json(200, { received: true, ignored: 'household_gone' });
    }
    console.error(
      `event ${event.id}: revoke_crown failed for household ${householdId}: ${revokeError.message}`
    );
    return json(500, { error: 'internal' });
  }

  // revoke_crown answers FALSE, without raising, for the two ordinary no-ops: a
  // redelivered event whose id is already in the ledger, and a sale some earlier
  // event already reversed. Both are a clean 200 — but neither is a revocation,
  // and these logs are the only way a human notices trouble on this path, so the
  // line must not assert one. The boolean cannot tell the two cases apart, hence
  // both are named; either way nothing in the database changed.
  if (revoked !== true) {
    console.log(
      `event ${event.id}: ${reason} on ${paymentIntentId} changed nothing for household ${householdId} — already reversed, or this event was already recorded`
    );
    return json(200, { received: true, revoked: false });
  }

  console.log(
    `event ${event.id}: crown revoked from household ${householdId} (${reason})`
  );
  return json(200, { received: true, revoked: true });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  // The grant path needs no outbound Stripe call — everything it needs arrives
  // in the signed event — but the reversal path does one lookup to trace a
  // refund back to its Checkout session, so the key must be a real one.
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) {
    return json(503, { error: 'not_configured' });
  }

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) {
    return json(400, { error: 'missing_signature' });
  }

  // Raw text, never req.json(): the HMAC is computed over the exact bytes
  // Stripe sent, and re-serializing a parsed object would change them.
  const payload = await req.text();

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    // Expected in the wild (scanners, a stale endpoint secret after a rotation)
    // — log the reason, never the payload or the signature.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`signature verification failed: ${detail.slice(0, 300)}`);
    return json(400, { error: 'invalid_signature' });
  }

  // Everything below is verified-authentic Stripe data.
  //
  // A refund or a lost chargeback undoes the purchase, so it has to undo the
  // entitlement too — see handleReversal for how the household is traced.
  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.dispute.closed'
  ) {
    return await handleReversal(event, stripe);
  }

  // checkout.session.completed fires as soon as Checkout finishes, which for a
  // delayed payment method (some bank debits) can be BEFORE the money is
  // captured — hence the payment_status gate. async_payment_succeeded is the
  // later "it actually cleared" event for exactly those sessions, and carries
  // the same session object, so both routes into the same handling.
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return json(200, { received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== 'paid') {
    // Not a failure: the async_payment_succeeded event will arrive when (and
    // if) the payment clears, and that is when Crown gets granted.
    console.log(
      `event ${event.id}: session ${session.id} not paid yet (${session.payment_status}) — waiting`
    );
    return json(200, { received: true, pending: true });
  }

  // The household id is OUR value round-tripped through Stripe: it was set by
  // create-checkout-session after a membership check, and the signature above
  // proves this is Stripe handing it back. It is not attacker-supplied.
  const householdId =
    session.client_reference_id ??
    (typeof session.metadata?.household_id === 'string'
      ? session.metadata.household_id
      : null);

  if (!householdId || !UUID_RE.test(householdId)) {
    // A session created outside our checkout flow (a dashboard test payment, a
    // manual comp) has no household attached. Retrying will never attach one,
    // so acknowledge it and surface it for a human.
    console.error(
      `event ${event.id}: session ${session.id} has no usable household id — not granting`
    );
    return json(200, { received: true, ignored: 'no_household' });
  }

  const supabase = serviceClient();

  // Idempotency lives in the database, not here: grant_crown records the event
  // id under a UNIQUE constraint, so Stripe's at-least-once delivery (and the
  // completed → async_payment_succeeded pair for delayed methods) collapses to
  // one grant. Crown is permanent, so a duplicate would be harmless anyway —
  // the crown_purchases ledger is what must not double-count.
  //
  // Argument names must match 0012's parameter names exactly; PostgREST picks
  // the overload by name, so a near-miss is a PGRST202, not a coercion.
  const { error: grantError } = await supabase.rpc('grant_crown', {
    p_household: householdId,
    p_source: 'stripe',
    p_event: event.id,
    p_session: session.id,
    p_amount: session.amount_total ?? null,
    p_currency: session.currency ?? null,
  });
  if (grantError) {
    // 23503 is the one grant failure a retry can never clear: the ledger insert
    // hit the household_id foreign key because the household (or the account
    // behind it) was deleted between checkout and this delivery. Answering 500
    // would have Stripe redeliver for ~3 days and still fail. So: 200, and a log
    // a human cannot miss — the customer was charged for an entitlement that
    // can never land, and owed a refund nobody else is going to notice.
    if (grantError.code === '23503') {
      console.error(
        `MANUAL REFUND NEEDED — event ${event.id}: session ${session.id} was paid, ` +
          `but household ${householdId} no longer exists and Crown cannot be granted`
      );
      return json(200, { received: true, ignored: 'household_gone' });
    }
    // Everything else gets a 500 on purpose: the customer has paid and is owed
    // the entitlement, so we want Stripe to keep retrying. A PGRST202 here means
    // 0012 has not been applied, or its argument NAMES drifted from the block at
    // the top of this file — fix that and the retries will settle it.
    console.error(
      `event ${event.id}: grant_crown failed for household ${householdId}: ${grantError.message}`
    );
    return json(500, { error: 'internal' });
  }

  console.log(`event ${event.id}: crown granted to household ${householdId}`);
  return json(200, { received: true, granted: true });
});
