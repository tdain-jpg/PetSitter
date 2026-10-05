// Edge Function: admin-promo
//
// Lets the admin page list, create and switch off Stripe promotion codes, so
// Tim can issue a code without opening the Stripe dashboard while Stripe stays
// the record for every discount (his call, 2026-10-05: one consistent set of
// money reports).
//
// THE ONLY FUNCTION THAT WRITES TO STRIPE ON A PERSON'S COMMAND. So:
//   - the caller's JWT is resolved to a user, and that user must pass
//     public.is_admin() (0041), checked through the caller's own session, on
//     every request before Stripe is touched;
//   - creation takes a short menu of kinds, not raw coupon parameters, and
//     each coupon is locked to its product (applies_to), so a sitter code can
//     never discount Crown or the reverse;
//   - "delete" does not exist: a code is switched off (active=false), which
//     keeps its history in Stripe's reports.
//
// Contract: POST { action: 'list' }
//           POST { action: 'create', kind, code, percent?, months?,
//                  max_redemptions?, expires_on? ('YYYY-MM-DD') }
//           POST { action: 'deactivate', id }
// kinds: crown_free (100% off Crown, once) | crown_percent (percent% off Crown)
//        sitter_free_months (100% off sitter, months) | sitter_percent
//        (percent% off sitter, months). Sitter codes work on the MONTHLY plan;
//        sitter-billing gives the yearly checkout no code box.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

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

const KINDS = ['crown_free', 'crown_percent', 'sitter_free_months', 'sitter_percent'] as const;
type Kind = (typeof KINDS)[number];
// Stripe allows letters, digits and dashes in a code (no underscores).
const CODE_RE = /^[A-Z0-9-]{3,40}$/;

async function productOfPrice(stripe: Stripe, priceId: string | undefined): Promise<string | null> {
  if (!priceId) return null;
  const price = await stripe.prices.retrieve(priceId);
  return typeof price.product === 'string' ? price.product : price.product?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(400, { error: 'bad_request' });
  }

  // Admin check through the CALLER's session: is_admin() reads auth.uid().
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json(401, { error: 'unauthorized' });
  const { data: admin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || admin !== true) return json(403, { error: 'forbidden' });

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return json(503, { error: 'billing_not_configured' });
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  const action = String(body.action ?? '');

  try {
    if (action === 'list') {
      const codes = await stripe.promotionCodes.list({ limit: 100, expand: ['data.promotion.coupon'] });
      return json(200, {
        codes: codes.data.map((p) => {
          const c = (p.promotion?.coupon ?? null) as Stripe.Coupon | null;
          return {
            id: p.id,
            code: p.code,
            active: p.active,
            times_redeemed: p.times_redeemed,
            max_redemptions: p.max_redemptions,
            expires_at: p.expires_at,
            created: p.created,
            kind: (c?.metadata?.kind as string) ?? null,
            percent_off: c?.percent_off ?? null,
            duration: c?.duration ?? null,
            duration_in_months: c?.duration_in_months ?? null,
          };
        }),
      });
    }

    if (action === 'deactivate') {
      const id = String(body.id ?? '');
      if (!/^promo_[A-Za-z0-9]+$/.test(id)) return json(400, { error: 'bad_request' });
      await stripe.promotionCodes.update(id, { active: false });
      console.log(`admin ${user.id} switched off promotion code ${id}`);
      return json(200, { ok: true });
    }

    if (action === 'create') {
      const kind = String(body.kind ?? '') as Kind;
      if (!KINDS.includes(kind)) return json(400, { error: 'bad_kind' });
      const code = String(body.code ?? '').trim().toUpperCase();
      if (!CODE_RE.test(code)) return json(400, { error: 'bad_code' });

      const isCrown = kind.startsWith('crown');
      const isFree = kind === 'crown_free' || kind === 'sitter_free_months';
      const percent = isFree ? 100 : Math.round(Number(body.percent));
      if (!Number.isFinite(percent) || percent < 1 || percent > 100) return json(400, { error: 'bad_percent' });
      const months = isCrown ? null : Math.round(Number(body.months));
      if (!isCrown && (!Number.isFinite(months) || months! < 1 || months! > 24)) {
        return json(400, { error: 'bad_months' });
      }
      const maxRedemptions =
        body.max_redemptions == null || body.max_redemptions === '' ? undefined : Math.round(Number(body.max_redemptions));
      if (maxRedemptions !== undefined && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100000)) {
        return json(400, { error: 'bad_max' });
      }
      let expiresAt: number | undefined;
      if (body.expires_on) {
        const m = String(body.expires_on).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return json(400, { error: 'bad_expiry' });
        // End of that day, US Central, close enough for a promotion.
        expiresAt = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) / 1000) + 5 * 3600;
        if (expiresAt <= Math.floor(Date.now() / 1000)) return json(400, { error: 'bad_expiry' });
      }

      const product = isCrown
        ? Deno.env.get('STRIPE_PRODUCT_ID') ?? (await productOfPrice(stripe, Deno.env.get('STRIPE_PRICE_ID')))
        : await productOfPrice(stripe, Deno.env.get('STRIPE_SITTER_PRICE_MONTHLY'));
      if (!product) return json(503, { error: 'billing_not_configured' });

      const name = isCrown
        ? isFree ? 'Free Crown' : `${percent}% off Crown`
        : isFree ? `${months} sitter month${months === 1 ? '' : 's'} free` : `${percent}% off sitter plan for ${months} month${months === 1 ? '' : 's'}`;

      const coupon = await stripe.coupons.create(
        {
          percent_off: percent,
          duration: isCrown ? 'once' : 'repeating',
          ...(isCrown ? {} : { duration_in_months: months! }),
          applies_to: { products: [product] },
          name: name.slice(0, 40),
          metadata: { kind, created_by: user.id, created_via: 'pawstructions-admin' },
        },
        { idempotencyKey: `admin-coupon:${code}` }
      );
      const promo = await stripe.promotionCodes.create(
        {
          promotion: { type: 'coupon', coupon: coupon.id },
          code,
          ...(maxRedemptions !== undefined ? { max_redemptions: maxRedemptions } : {}),
          ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
          metadata: { kind, created_by: user.id },
        },
        { idempotencyKey: `admin-promo:${code}` }
      );
      console.log(`admin ${user.id} created promotion code ${promo.code} (${kind})`);
      return json(200, { id: promo.id, code: promo.code, name });
    }

    return json(400, { error: 'bad_action' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`admin-promo ${action} failed: ${msg}`);
    // Stripe's own message is the useful one here (e.g. code already exists),
    // and only an admin can ever see it.
    return json(502, { error: 'stripe_error', message: msg.slice(0, 300) });
  }
});
