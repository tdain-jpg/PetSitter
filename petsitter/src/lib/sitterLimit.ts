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

/** The wording both accept handlers show. Kept here so they cannot drift. */
export function sitterLimitMessage(error: unknown): string {
  const counts = sitterLimitCounts(error);
  const ceiling = counts
    ? `You are caring for ${counts.active} households, which is the ${counts.limit} included for free.`
    : 'You have reached the number of client households included for free.';
  return `${ceiling}\n\nA subscription lifts the limit entirely. Nothing you already have is affected — your current clients stay exactly as they are.`;
}
