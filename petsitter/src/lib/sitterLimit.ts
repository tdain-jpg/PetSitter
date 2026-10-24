/**
 * Recognising the sitter client limit coming back from the database.
 *
 * respond_to_sitter_invite refuses a fourth free client by raising
 * `sitter_client_limit_reached (3 of 3)`. That string crosses PostgREST as an
 * ordinary error message, so the two call sites that accept invitations have to
 * pick it out and offer the plan instead of showing a red failure — a paywall
 * that presents as an error reads as a broken app.
 *
 * The counts travel inside the message on purpose: the screen can say "3 of 3"
 * without a second round trip, and if the message ever arrives without them the
 * prompt degrades to the sentence without the numbers rather than to nothing.
 */

const LIMIT_MARKER = 'sitter_client_limit_reached';

export function isSitterClientLimitError(error: unknown): boolean {
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' && message.includes(LIMIT_MARKER);
}

export function sitterLimitCounts(
  error: unknown
): { active: number; limit: number } | null {
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== 'string') return null;
  const match = message.match(/\((\d+) of (\d+)\)/);
  if (!match) return null;
  return { active: Number(match[1]), limit: Number(match[2]) };
}

/**
 * The wording every limit dialog shows. Kept here so they cannot drift.
 *
 * `trialEligible` is whether this sitter can still get the free month (they
 * have never subscribed). Promising it to someone who has already used it,
 * then not offering it on Sitter Plans, read as a bait and switch (QA,
 * 2026-10-24). When the caller does not know, the wording makes no promise.
 */
export function sitterLimitMessage(_error?: unknown, trialEligible?: boolean): string {
  // Since 0045 there are no free sitter-brought clients: inviting your own
  // client needs Pro. Owners who invite YOU are always free, and the clients
  // you already have are never affected.
  const offer =
    trialEligible === true
      ? 'Your first month is free: you enter a card, cancel anytime in the month, and are not charged until it ends. Then $9 a month or $79 a year.'
      : trialEligible === false
        ? 'Pro is $9 a month or $79 a year, and you can cancel anytime.'
        : 'Pro is $9 a month or $79 a year, and a sitter who has never had Pro gets the first month free.';
  return `Bringing in your own clients is part of Pro. ${offer}\n\nFamilies who invite you themselves are always free, and nothing you already have is affected.`;
}
