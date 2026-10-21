// Edge Function: owner-billing
//
// Pawstructions Plus for a household (0045, Tim 2026-10-21): $3/month or
// $24/year, no trial (the free tier is the trial). Plus replaces the one-time
// Crown; households that bought Crown keep it, and Crown counts as Plus.
//
//   POST { action: 'checkout', plan: 'monthly' | 'yearly' }  -> { url }
//   POST { action: 'portal' }                                 -> { url }
//
// The household is the caller's DEFAULT household, resolved server-side, so a
// client cannot buy (or open the billing of) a household it does not belong
// to. The subscription carries kind 'plus' and the household id in its
// metadata; stripe-webhook routes on those to apply_household_subscription.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PLUS_PRICE_MONTHLY, STRIPE_PLUS_PRICE_YEARLY.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://pawstructions.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Where Checkout and the portal send the browser back: the Plus screen. */
function returnUrl(outcome: 'success' | 'cancelled' | 'done'): string {
  return `${APP_URL}/Main/UnlockCrown?checkout=${outcome}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });

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
  if (action !== 'checkout' && action !== 'portal') return json(400, { error: 'bad_request' });
  if (action === 'checkout' && plan !== 'monthly' && plan !== 'yearly') return json(400, { error: 'bad_request' });

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return json(503, { error: 'billing_not_configured' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json(401, { error: 'unauthorized' });

  // The caller's own default household, answered by the caller's session.
  const { data: householdId, error: hhError } = await supabase.rpc('my_primary_household');
  if (hhError || typeof householdId !== 'string') return json(400, { error: 'no_household' });
  const { data: planStatus, error: planError } = await supabase.rpc('owner_plan_status', { h: householdId });
  if (planError) return json(400, { error: 'no_household' });

  // household_subscriptions is service-role only; read the customer here.
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing } = await service
    .from('household_subscriptions')
    .select('stripe_customer_id, status')
    .eq('household_id', householdId)
    .maybeSingle();
  const customerId = existing?.stripe_customer_id ?? null;

  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  if (action === 'portal') {
    if (!customerId) return json(404, { error: 'no_customer' });
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl('done'),
      });
      return json(200, { url: session.url });
    } catch (e) {
      console.error(`plus portal failed for household ${householdId}: ${e}`);
      return json(502, { error: 'stripe_error' });
    }
  }

  // Never sell Plus twice, and never to a household Crown already covers.
  if (planStatus?.has_plus === true) return json(409, { error: 'already_subscribed' });

  const priceId =
    plan === 'yearly' ? Deno.env.get('STRIPE_PLUS_PRICE_YEARLY') : Deno.env.get('STRIPE_PLUS_PRICE_MONTHLY');
  if (!priceId || !priceId.startsWith('price_')) {
    console.error(`billing not configured: STRIPE_PLUS_PRICE_${plan === 'yearly' ? 'YEARLY' : 'MONTHLY'}`);
    return json(503, { error: 'billing_not_configured' });
  }

  try {
    const metadata = { kind: 'plus', household_id: householdId, user_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: householdId,
      metadata,
      // Survives onto every later customer.subscription.* and invoice.* event.
      subscription_data: { metadata },
      ...(customerId ? { customer: customerId } : { customer_email: user.email ?? undefined }),
      success_url: returnUrl('success'),
      cancel_url: returnUrl('cancelled'),
      // Monthly only, for the same reason as the sitter plan: a "months free"
      // coupon on the yearly price would discount the whole first year.
      allow_promotion_codes: plan !== 'yearly',
      payment_method_collection: 'if_required',
    });
    if (!session.url) return json(502, { error: 'stripe_error' });
    return json(200, { url: session.url });
  } catch (e) {
    console.error(`plus checkout failed for household ${householdId}: ${e}`);
    return json(502, { error: 'stripe_error' });
  }
});
