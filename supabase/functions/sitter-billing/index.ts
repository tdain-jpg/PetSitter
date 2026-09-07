// Sitter subscription billing: start a subscription, or open the portal to
// manage one.
//
// POST { action: 'checkout', plan: 'monthly' | 'yearly' } → { url }
// POST { action: 'portal' }                               → { url }
// with the caller's Authorization header.
//
//   400 { error: 'bad_request' }             unknown action or plan
//   401 { error: 'unauthorized' }            missing/invalid Authorization
//   409 { error: 'already_subscribed' }      a live plan already exists
//   404 { error: 'no_customer' }             portal asked for with nothing to manage
//   503 { error: 'billing_not_configured' }  secrets missing
//
// WHY THIS IS NOT PART OF create-checkout-session. That function sells Crown:
// one payment, for a HOUSEHOLD, guarded by several layers of double-charge
// protection specific to a one-off sale, and proven end to end with real money
// including a refund. This sells a SUBSCRIPTION, to a USER, where "charged
// twice" means something entirely different (two live subscriptions, not two
// charges) and where the portal has to exist. Sharing a function would mean
// editing the one code path in this product that is known-good and handling
// real money, to add branches it never takes. Separate function, separate
// blast radius.
//
// TRUST. The subscriber is taken from the verified JWT and never from the
// request body, so a caller cannot buy a plan for — or on behalf of — anyone
// else. The webhook learns who paid from client_reference_id and from metadata
// on both the session and the subscription, all three set here from that same
// verified id.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_SITTER_PRICE_MONTHLY,
// STRIPE_SITTER_PRICE_YEARLY. Optional APP_URL.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://pawstructions.com';

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

/** Where Checkout and the portal send the browser back. */
function returnUrl(outcome: 'success' | 'cancelled' | 'done'): string {
  return `${APP_URL}/Main/SitterPlans?checkout=${outcome}`;
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

  let action = 'checkout';
  let plan = 'monthly';
  try {
    const raw = await req.text();
    if (raw.length > 0) {
      const body = JSON.parse(raw);
      if (body?.action != null) action = String(body.action);
      if (body?.plan != null) plan = String(body.plan);
    }
  } catch {
    return json(400, { error: 'bad_request' });
  }

  if (action !== 'checkout' && action !== 'portal') {
    return json(400, { error: 'bad_request' });
  }
  if (action === 'checkout' && plan !== 'monthly' && plan !== 'yearly') {
    return json(400, { error: 'bad_request' });
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) {
    console.error('billing not configured — STRIPE_SECRET_KEY is unset');
    return json(503, { error: 'billing_not_configured' });
  }

  // User-scoped client, so the row read below is the caller's own by RLS
  // rather than by a WHERE clause we could get wrong.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json(401, { error: 'unauthorized' });
  }

  // Matching create-checkout-session: no apiVersion pinned (the SDK ships with
  // the version it was built against, and a hardcoded date string only creates
  // a way for the two to drift), and createFetchHttpClient because the default
  // Node http client does not exist on Deno Edge.
  const stripe = new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // The caller's existing billing row, if any. Reusing the Stripe customer is
  // what keeps one sitter from accumulating a customer record per attempt, and
  // it is the only way the portal has anything to open.
  const { data: existing } = await supabase
    .from('sitter_subscriptions')
    .select('stripe_customer_id, status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  const customerId = existing?.stripe_customer_id ?? null;

  if (action === 'portal') {
    if (!customerId) {
      return json(404, { error: 'no_customer' });
    }
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl('done'),
      });
      return json(200, { url: session.url });
    } catch (e) {
      console.error(`portal session failed for user ${user.id}: ${e}`);
      return json(502, { error: 'stripe_error' });
    }
  }

  // Don't sell a second subscription to someone who already has one. Stripe
  // would happily create it and bill them twice; the portal is where an
  // existing subscriber changes plan.
  const liveStatuses = ['active', 'trialing', 'past_due'];
  const stillWithinPeriod =
    !existing?.current_period_end ||
    new Date(existing.current_period_end).getTime() > Date.now();
  if (existing && liveStatuses.includes(existing.status) && stillWithinPeriod) {
    return json(409, { error: 'already_subscribed' });
  }

  const priceId =
    plan === 'yearly'
      ? Deno.env.get('STRIPE_SITTER_PRICE_YEARLY')
      : Deno.env.get('STRIPE_SITTER_PRICE_MONTHLY');

  if (!priceId || !priceId.startsWith('price_')) {
    console.error(
      `billing not configured — ${
        plan === 'yearly'
          ? 'STRIPE_SITTER_PRICE_YEARLY'
          : 'STRIPE_SITTER_PRICE_MONTHLY'
      } must be a price_... id`
    );
    return json(503, { error: 'billing_not_configured' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Three copies of the same verified id, because the webhook reads
      // whichever of them the event it is holding happens to carry:
      // client_reference_id on the session, metadata on the session, and
      // metadata on the subscription — which is the only one that survives
      // onto later invoice.* and customer.subscription.* events.
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      ...(customerId
        ? { customer: customerId }
        : { customer_email: user.email ?? undefined }),
      success_url: returnUrl('success'),
      cancel_url: returnUrl('cancelled'),
      allow_promotion_codes: true,
    });

    if (!session.url) {
      console.error(`checkout session ${session.id} came back with no url`);
      return json(502, { error: 'stripe_error' });
    }
    return json(200, { url: session.url });
  } catch (e) {
    console.error(`sitter checkout failed for user ${user.id}: ${e}`);
    return json(502, { error: 'stripe_error' });
  }
});
