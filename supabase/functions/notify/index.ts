// Edge Function: notify
//
// Drains the notifications_outbox through the Brevo transactional email API,
// and (daily mode) queues "trip starts tomorrow, guide incomplete" reminders.
// Called ONLY by the GitHub Actions cron (.github/workflows/notify-cron.yml) —
// never by the client.
//
// DEPLOYMENT NOTE: deploy with JWT verification DISABLED
// (supabase functions deploy notify --no-verify-jwt, or verify_jwt = false).
// The cron caller has no Supabase JWT; authentication is the x-cron-secret
// header checked below, nothing else.
//
// Contract:
//   POST with header 'x-cron-secret: <CRON_SECRET>'
//   body { mode: 'drain' }  → send up to 50 pending outbox rows, return counts
//   body { mode: 'daily' }  → queue trip_incomplete reminders for guides that
//                             start tomorrow (UTC) and are missing emergency
//                             contacts or home info, then run a drain pass
//   401 { error: 'unauthorized' }        wrong/missing x-cron-secret
//   503 { error: 'not_configured' }      CRON_SECRET env unset
//   503 { error: 'email_not_configured' } BREVO_API_KEY env unset
//
// Secrets: CRON_SECRET, BREVO_API_KEY (Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided by the platform.
//
// Outbox row shape this function relies on (0008 notifications_outbox):
//   id, kind ('invite' | 'share_opened' | 'trip_incomplete' | 'sitter_checkin'),
//   recipient_email,
//   payload (jsonb), dedupe_key (unique), attempts, sent_at, last_error,
//   created_at

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SENDER = { name: 'Pawstructions', email: 'noreply@pawstructions.com' };
const APP_URL = 'https://pawstructions.com';
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Constant-time string comparison so the shared secret can't be probed
// byte-by-byte via response timing.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ----------------------------------------------------------------------------
// Email templates — simple branded inline-styled HTML.
// Castles & Currents palette: navy headings #1E3A5F, cream bg #F5EDD6,
// teal CTA #3C6779, ink text #263544, muted text #4F6072.
// ----------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ctaButton(label: string): string {
  return `<p style="margin: 24px 0;">
    <a href="${APP_URL}" style="display: inline-block; background-color: #3C6779; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: bold; padding: 12px 28px; border-radius: 8px;">${escapeHtml(label)}</a>
  </p>`;
}

function emailShell(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background-color: #F5EDD6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5EDD6; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%; background-color: #FEFDF9; border-radius: 12px;">
            <tr>
              <td style="padding: 32px; font-family: Arial, Helvetica, sans-serif; color: #263544; font-size: 15px; line-height: 1.6;">
                <p style="margin: 0 0 20px; font-size: 14px; font-weight: bold; letter-spacing: 1px; color: #1E3A5F;">PAWSTRUCTIONS</p>
                <h1 style="margin: 0 0 16px; font-size: 22px; line-height: 1.3; color: #1E3A5F;">${heading}</h1>
                ${bodyHtml}
                <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #DCE3EB; font-size: 12px; color: #4F6072;">Pawstructions &middot; pet care instructions your sitter will actually read</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface OutboxRow {
  id: string;
  kind: string;
  recipient_email: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  created_at: string;
}

// Subjects are plain header text, not HTML: strip CR/LF/tabs (header-injection
// vectors — Brevo's sanitization is not something to depend on) and cap the
// length so a household member's crafted guide title can't break another
// member's email subject.
function subjectSafe(value: unknown, fallback: string): string {
  return String(value || fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 120);
}

// Returns the subject + HTML for an outbox row, or null for an unknown kind
// (which is recorded as a failure so the row doesn't retry forever).
function buildEmail(row: OutboxRow): { subject: string; html: string } | null {
  const p = row.payload ?? {};

  switch (row.kind) {
    case 'invite': {
      const inviter = escapeHtml(p.inviter_email || 'A Pawstructions user');
      const household = escapeHtml(p.household_name || 'their household');
      const recipient = escapeHtml(row.recipient_email);
      return {
        subject: "You're invited to share pet care on Pawstructions",
        html: emailShell(
          "You're invited to share pet care",
          `<p style="margin: 0 0 16px;"><strong>${inviter}</strong> invited you to <strong>${household}</strong> on Pawstructions &mdash; shared pets, guides, and care instructions in one place.</p>
          ${ctaButton('Open Pawstructions')}
          <p style="margin: 0;">Sign up or sign in with THIS email address (<strong>${recipient}</strong>) and the invitation will be waiting on your home screen.</p>`
        ),
      };
    }

    case 'share_opened': {
      const title = escapeHtml(p.guide_title || 'your guide');
      return {
        subject: `Your sitter opened ${subjectSafe(p.guide_title, 'your guide')}`,
        html: emailShell(
          `Your sitter opened ${title}`,
          `<p style="margin: 0 0 16px;">Good news &mdash; your sitter just opened <strong>${title}</strong>.</p>
          <p style="margin: 0;">Feeding schedules, medications, and emergency contacts are all at their fingertips. Nothing for you to do; we just thought you'd like to know your pets are in the loop.</p>`
        ),
      };
    }

    // Drafted by a local qwen3-coder from a spec, then reviewed. It got the
    // subtle part right unprompted-by-example — truncate BEFORE escaping, so a
    // cut never lands inside an &amp; and leaves half an entity on screen. Nine
    // corrections went in on review; the two that mattered were an unguarded
    // .substring() on untyped JSON (a note arriving as anything but a string
    // throws and takes the whole outbox batch down with it) and an empty <p>
    // rendered whenever guide_title was absent.
    case 'sitter_checkin': {
      const sitter = escapeHtml(p.sitter_name || 'Your sitter');
      const household = p.household_name ? escapeHtml(p.household_name) : null;
      const guideTitle = p.guide_title ? escapeHtml(p.guide_title) : null;

      // String() first: row.payload is untyped JSON off the queue, and a note
      // that is not a string would throw here and fail every other row in the
      // same batch. Truncated BEFORE escaping so the cut can never land inside
      // an entity and leave "&am" on the page.
      const rawNote = p.note == null ? '' : String(p.note);
      const note =
        rawNote.length > 300 ? `${rawNote.slice(0, 300)}\u2026` : rawNote;

      const noteHtml = note
        ? `<blockquote style="margin: 0 0 16px; padding: 12px 16px; background-color: #F5EDD6; border-left: 3px solid #3C6779; border-radius: 4px; color: #263544; font-style: italic;">${escapeHtml(note)}</blockquote>`
        : '<p style="margin: 0 0 16px;">They did not leave a note.</p>';

      // Named only when we have one. An owner can belong to more than one
      // household, and "someone checked in" is not much use if you cannot tell
      // whose animals are meant.
      const wherePart = guideTitle
        ? ` on <strong>${guideTitle}</strong>`
        : household
          ? ` at <strong>${household}</strong>`
          : '';

      return {
        subject: `${subjectSafe(p.sitter_name, 'Your sitter')} checked in on your pets`,
        html: emailShell(
          `${sitter} checked in`,
          `<p style="margin: 0 0 16px;">${sitter} left an update${wherePart}.</p>
          ${noteHtml}
          <p style="margin: 0 0 16px;">Nothing for you to do &mdash; we just thought you would want to hear it.</p>
          ${ctaButton('See the check-in')}`
        ),
      };
    }

    case 'trip_incomplete': {
      const title = escapeHtml(p.guide_title || 'Your guide');
      const missing = Array.isArray(p.missing) ? p.missing : [];
      const missingItems = missing
        .map(
          (m) =>
            `<li style="margin: 0 0 8px; color: #263544;">${escapeHtml(m)}</li>`
        )
        .join('');
      return {
        subject: `Your trip starts tomorrow — ${subjectSafe(p.guide_title, 'your guide')} is missing something`,
        html: emailShell(
          'Your trip starts tomorrow',
          `<p style="margin: 0 0 16px;"><strong>${title}</strong> is almost ready, but your sitter will be missing:</p>
          <ul style="margin: 0 0 16px; padding-left: 20px;">${missingItems || '<li style="margin: 0 0 8px;">A few details</li>'}</ul>
          <p style="margin: 0 0 8px;">Two minutes now saves a phone call from the sitter later.</p>
          ${ctaButton('Finish the guide')}`
        ),
      };
    }

    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Drain: send pending outbox rows through Brevo
// ----------------------------------------------------------------------------

async function drainPass(
  supabase: SupabaseClient,
  brevoKey: string
): Promise<{ sent: number; failed: number }> {
  const { data: rows, error } = await supabase
    .from('notifications_outbox')
    .select('id, kind, recipient_email, payload, attempts, created_at')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    throw new Error(`outbox select failed: ${error.message}`);
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    // Atomically claim the row before sending. Two overlapping drains (a cron
    // collision, a retried workflow, a manual dispatch) can both SELECT the
    // same pending rows above; the compare-and-swap here — bump attempts only
    // if the row is still unsent AND untouched since our read — guarantees at
    // most one invocation wins the claim, so nobody gets a duplicate email.
    // (dedupe_key uniqueness only dedupes ENQUEUE; this dedupes SEND.)
    const { data: claimed, error: claimError } = await supabase
      .from('notifications_outbox')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id)
      .eq('attempts', row.attempts ?? 0)
      .is('sent_at', null)
      .select('id');
    if (claimError) {
      console.error(`row ${row.id}: claim failed: ${claimError.message}`);
      failed++;
      continue;
    }
    if (!claimed || claimed.length === 0) {
      // Another invocation claimed (or already sent) this row — skip it.
      continue;
    }

    let failure: string | null = null;

    const email = buildEmail(row as OutboxRow);
    if (!email) {
      failure = `unknown kind: ${row.kind}`;
    } else {
      try {
        const res = await fetch(BREVO_ENDPOINT, {
          method: 'POST',
          headers: {
            'api-key': brevoKey,
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            sender: SENDER,
            to: [{ email: row.recipient_email }],
            subject: email.subject,
            htmlContent: email.html,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          failure = `brevo ${res.status}: ${detail.slice(0, 300)}`;
        }
      } catch (err) {
        failure = `brevo fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (failure === null) {
      const { error: updateError } = await supabase
        .from('notifications_outbox')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) {
        // The email went out but we couldn't record it; surface loudly so a
        // stuck sent_at doesn't cause a resend storm to go unnoticed.
        console.error(`row ${row.id}: sent but update failed: ${updateError.message}`);
        failed++;
      } else {
        sent++;
      }
    } else {
      console.error(`row ${row.id} (${row.kind}) failed: ${failure}`);
      // attempts was already incremented by the claim above; just record why.
      const { error: updateError } = await supabase
        .from('notifications_outbox')
        .update({ last_error: failure.slice(0, 500) })
        .eq('id', row.id);
      if (updateError) {
        console.error(`row ${row.id}: failure update failed: ${updateError.message}`);
      }
      failed++;
    }
  }

  return { sent, failed };
}

// ----------------------------------------------------------------------------
// Daily: queue trip_incomplete reminders for guides starting tomorrow (UTC),
// plus a today catch-up for runs the scheduler missed
// ----------------------------------------------------------------------------

async function dailyScan(supabase: SupabaseClient): Promise<{ queued: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Scan today AND tomorrow: GitHub scheduled workflows are best-effort (runs
  // get delayed or skipped, and schedules pause after 60 days of repo
  // inactivity), so a tomorrow-only match would permanently skip every guide
  // whose D-1 run was missed. Including today lets the next day's run catch
  // up; the dedupe_key encodes guide.start_date and the upsert is ON CONFLICT
  // DO NOTHING, so guides already handled by yesterday's run are not
  // re-queued. Deliberately no wider window (no future dates, no >=): the
  // "starts tomorrow" copy and D-1 timing only fit these two days.
  const { data: guides, error } = await supabase
    .from('guides')
    .select('id, user_id, household_id, title, start_date, emergency_contacts, home_info')
    .in('start_date', [today, tomorrow]);
  if (error) {
    throw new Error(`guides select failed: ${error.message}`);
  }

  // Cache user lookups across guides — households share members.
  const userCache = new Map<string, { email: string; confirmed: boolean } | null>();
  async function confirmedEmailOf(userId: string): Promise<string | null> {
    if (!userCache.has(userId)) {
      const { data, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !data?.user) {
        console.error(`user lookup failed for ${userId}: ${userError?.message}`);
        userCache.set(userId, null);
      } else {
        userCache.set(userId, {
          email: data.user.email ?? '',
          confirmed: Boolean(data.user.email && data.user.email_confirmed_at),
        });
      }
    }
    const entry = userCache.get(userId);
    return entry && entry.confirmed ? entry.email : null;
  }

  let queued = 0;

  for (const guide of guides ?? []) {
    const contacts = guide.emergency_contacts;
    const home = guide.home_info;
    const missing: string[] = [];
    if (!Array.isArray(contacts) || contacts.length === 0) {
      missing.push('Emergency contacts');
    }
    if (!home || typeof home !== 'object' || Object.keys(home).length === 0) {
      missing.push('Home & access info');
    }
    if (missing.length === 0) continue;

    // Everyone in the guide's household gets the nudge. Legacy guides that
    // somehow predate the household backfill fall back to the guide owner.
    let memberIds: string[] = [];
    if (guide.household_id) {
      const { data: members, error: membersError } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', guide.household_id);
      if (membersError) {
        console.error(`members select failed for guide ${guide.id}: ${membersError.message}`);
        continue;
      }
      memberIds = (members ?? []).map((m) => m.user_id);
    }
    if (memberIds.length === 0 && guide.user_id) {
      memberIds = [guide.user_id];
    }

    for (const userId of memberIds) {
      const email = await confirmedEmailOf(userId);
      if (!email) continue;

      // ON CONFLICT (dedupe_key) DO NOTHING — reruns of the daily scan (or a
      // retried workflow) must not double-queue. upsert with ignoreDuplicates
      // compiles to exactly that; .select() returns only rows actually
      // inserted, which is what we count.
      const { data: inserted, error: insertError } = await supabase
        .from('notifications_outbox')
        .upsert(
          {
            kind: 'trip_incomplete',
            recipient_email: email,
            // No user_id column in notifications_outbox (0008) — the
            // dedupe_key below already encodes the target user.
            payload: { guide_title: guide.title, guide_id: guide.id, missing },
            dedupe_key: `trip_incomplete:${guide.id}:${userId}:${guide.start_date}`,
          },
          { onConflict: 'dedupe_key', ignoreDuplicates: true }
        )
        .select('dedupe_key');
      if (insertError) {
        console.error(`outbox insert failed for guide ${guide.id}: ${insertError.message}`);
        continue;
      }
      queued += inserted?.length ?? 0;
    }
  }

  return { queued };
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return json(503, { error: 'not_configured' });
  }
  const provided = req.headers.get('x-cron-secret');
  if (!provided || !timingSafeEqual(provided, cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }

  let mode: unknown;
  try {
    const body = await req.json();
    mode = body?.mode;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (mode !== 'drain' && mode !== 'daily') {
    return json(400, { error: 'bad_mode' });
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoKey) {
    return json(503, { error: 'email_not_configured' });
  }

  // Service-role client: this function is trusted infrastructure (guarded by
  // the cron secret above) and needs to see every household's outbox rows.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    if (mode === 'drain') {
      const counts = await drainPass(supabase, brevoKey);
      return json(200, counts);
    }
    // daily: queue reminders, then drain what we just queued (plus anything
    // else already pending).
    const { queued } = await dailyScan(supabase);
    const counts = await drainPass(supabase, brevoKey);
    return json(200, { queued, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`notify ${mode} failed: ${message}`);
    return json(500, { error: 'internal' });
  }
});
