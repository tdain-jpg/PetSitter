/**
 * One place that turns a thrown error into something a person can act on.
 *
 * WHY THIS EXISTS
 *   Two different kinds of failure reach the UI and only one of them was ever
 *   being translated:
 *
 *   1. RPC paths raise bare lowercase strings by design ('invalid email',
 *      'not authorized'). Three screens each grew their own private mapper for
 *      these, which is how the same message ended up worded three ways.
 *
 *   2. Direct PostgREST table calls fail with Postgres' own text, and nothing
 *      translated those at all. Browser QA caught the results verbatim in
 *      dialogs: `new row violates row-level security policy for table
 *      "share_links"` and `Cannot coerce the result to a single JSON object`.
 *      A sitter hitting a permission boundary should be told they cannot change
 *      someone else's guide — not shown the name of a table.
 *
 * THE COERCION ONE IS WORTH KNOWING ABOUT
 *   supabase-js raises "Cannot coerce the result to a single JSON object" when
 *   `.single()` gets back zero rows. Under RLS that is almost never a missing
 *   record — the row exists, the caller just may not see or touch it. Reading
 *   it as "not found" would tell a sitter their client's guide had vanished, so
 *   it maps to the permission wording instead.
 */

/** Postgres/PostgREST signatures that all mean "the server said no". */
const PERMISSION_SIGNATURES = [
  'violates row-level security',
  'permission denied',
  'insufficient_privilege',
  // .single() with zero visible rows — see the note above.
  'cannot coerce the result to a single json object',
  'jwt expired',
];

/** Known RPC messages, raised deliberately and meant to be shown. */
const RPC_MESSAGES: Record<string, string> = {
  'invalid email': "That doesn't look like an email address.",
  'not authorized': 'You do not have permission to do that.',
  'not authenticated': 'Please sign in and try again.',
  'invite not found': 'This invitation is no longer available.',
  'invite is not pending': 'This invitation is no longer available.',
  'not a member of this household': 'You are no longer a member of this household.',
  'that email already belongs to a household member':
    'That person is already in your household.',
  'that person is already in this household':
    'That person is already in your household, so they can already see everything a sitter could.',
  'that email already has a live connection to this household':
    'That person is already connected as a sitter here.',
  'your account has no confirmed email address':
    'Please confirm your email address first — check your inbox for the confirmation link.',
};

/**
 * @param raw       The caught error, or its message.
 * @param fallback  Shown when nothing else fits. Write it for the specific
 *                  action ("Could not save this guide."), not generically.
 */
export function friendlyError(raw: unknown, fallback: string): string {
  const message =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : typeof (raw as { message?: unknown })?.message === 'string'
          ? ((raw as { message: string }).message)
          : '';

  const trimmed = message.trim();
  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();

  const known = RPC_MESSAGES[lower];
  if (known) return known;

  if (PERMISSION_SIGNATURES.some((sig) => lower.includes(sig))) {
    if (lower.includes('jwt expired')) {
      return 'Your session has expired. Please sign in again.';
    }
    return "You don't have permission to change this. If you're helping out as a sitter, you can view and tick off tasks, but only the household can make changes.";
  }

  // Network failures read as gibberish otherwise ("Failed to fetch").
  if (lower.includes('failed to fetch') || lower.includes('network request failed')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  // Anything unrecognised: sentence-case it rather than hide it. An unexpected
  // message the user can quote back to us is worth more than a shrug — but a
  // raw Postgres string is not, so anything that still looks like machine text
  // falls back instead.
  if (/^[a-z_]+\.[a-z_]+|constraint|violates|pgrst|column .* does not exist/i.test(trimmed)) {
    return fallback;
  }
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
