-- 0046 Promotion codes can be redeemed on Pawstructions Plus (0045).
alter table public.promo_redemptions drop constraint if exists promo_redemptions_kind_check;
alter table public.promo_redemptions add constraint promo_redemptions_kind_check
  check (kind in ('crown', 'sitter', 'plus'));
