// Edge Function: generate-cheat-sheet
//
// Server-side AI cheat-sheet generation (Crown feature). The browser calls
// this via supabase.functions.invoke('generate-cheat-sheet', { body: { guideId } }),
// so the platform's default JWT verification applies and CORS must be handled.
//
// Contract (other code depends on these exact shapes):
//   POST { guideId: string }  with the user's Authorization header
//   200 { content: string, watermark: boolean }
//   402 { error: 'crown_required' }
//   429 { error: 'free_limit_reached', retry_after_minutes: number,
//         message: string }              (free-tier rate ceiling — see below)
//   503 { error: 'ai_not_configured' }   (ANTHROPIC_API_KEY secret not set)
//   404 { error: 'guide_not_found' }     (missing OR invisible under RLS)
//   502 { error: 'ai_failed' }           (Claude call failed, refused, or empty)
//   401 { error: 'unauthorized' }        (no Authorization header, or a token
//                                         that resolves to no user)
// This function upserts the cheat_sheets row itself before returning.
//
// Paywall (server-authoritative — the client's answer is never asked for):
//   1. Household has Crown            → generate, { watermark: false }
//   2. No Crown, guide's free
//      generation already spent       → 402 crown_required
//   3. No Crown, allowance intact, but
//      the ACCOUNT is over the
//      free-tier rate ceiling         → 429 free_limit_reached
//   4. Otherwise                      → claim a ledger row, generate, stamp the
//                                       marker, { watermark: true }. The claim
//                                       is released again if the generation
//                                       never gets billed.
//
// TWO SEPARATE RULES — keep them apart; conflating them is what took three
// rounds to get right:
//   * ONE FREE SHEET PER GUIDE (step 2) is the product PROMISE. Its state is
//     guides.free_generation_used_at — per GUIDE, stamped at the end of this
//     file, immutable to clients since 0013 §1. A new trip or a new pet earns
//     another free look; regenerating the SAME guide needs Crown.
//   * THE FREE-TIER RATE CEILING (step 3) is the ABUSE BOUND. Its state is the
//     ai_free_generations ledger (0014) — per ACCOUNT, service-role only. It
//     never reads or writes the per-guide marker, and the marker never feeds
//     it.
//
// THE FREE-TIER RATE CEILING (step 3) — why rule 1 cannot do rule 2's job
//   Guides are unlimited and free to create, so "one free sheet per guide" is
//   only a bound if guides are bounded, and nothing bounds them: not this
//   function, not config.toml, not RLS, not a trigger. Without the ceiling one
//   signup buys unlimited claude-opus-5 calls at roughly 4 cents each — create
//   guide, generate free sheet, repeat, forever, and scripted that is our
//   Anthropic bill, not theirs.
//
//   SCOPED BY auth.uid(), WHICH IS WHERE THE REGRESS STOPS. The scope was the
//   guide (free to mint), then the household (also free to mint: as a plain
//   authenticated user, `insert into households (name, created_by) values
//   ('x', <own uid>)` satisfies 0007's insert policy and 0006's table-wide
//   grant, so a per-household cap capped nothing per ACCOUNT — loop
//   create-household → create-guide → free sheet). An ACCOUNT is the first
//   scope key a loop cannot mint: it needs a confirmable email, which 0007
//   already leans on via my_confirmed_email(). Everything below counts by
//   user_id and by nothing else.
//
//   COUNTED FROM A LEDGER, NOT FROM MARKERS. A row lands in
//   ai_free_generations the moment a free generation is about to be charged
//   for, and is deleted again if that charge never happens, so the count is a
//   record of the AI calls we really paid for plus the ones in flight right now
//   (see CONCURRENCY below). Counting stamped free_generation_used_at values
//   instead was wrong in both directions:
//   importData (which re-creates guides from the backup file's own fields)
//   produces stamped rows with NO AI call behind them, over-counting an honest
//   user — while deleting a guide takes its marker with it, and importData
//   calls clearAllData FIRST, so restoring any backup wiped the count
//   entirely. The ledger has neither problem: 0014 gives it RLS with ZERO
//   policies and no anon/authenticated grants, so the client cannot read,
//   write or delete a row, and minting households, duplicating guides,
//   deleting guides and restoring a backup all leave the count exactly where
//   it was.
//
//   THE NUMBERS (FREE_BURST_LIMIT / FREE_DAILY_LIMIT below) are 8 per rolling
//   hour and 20 per rolling 24 hours, PER ACCOUNT. The walkthrough that must
//   not be blocked: someone setting up in one sitting with six pets and four
//   guides generates FOUR sheets — half the hourly allowance — and could sit
//   down and do the same four more times that day before meeting the daily
//   limit. A failed generation costs them nothing either: the ledger row is
//   claimed before the AI call and deleted again by every exit that never
//   produces a usable sheet — no API key, no pets, a thrown request, a refusal,
//   a truncation — so retrying a 502 is free. The price of that promise is that
//   a generation which keeps failing keeps costing us tokens the ceiling never
//   sees; the promise is worth it. The row STAYS, though, once a usable sheet
//   exists and only STORING it fails: there the money is spent, and a retry
//   loop over a broken write is exactly the spend this bounds. A script hits
//   both limits in seconds. The daily number is also the spend bound that
//   matters: 20 × ~4 cents ≈ 80 cents per ACCOUNT per day, worst case, instead
//   of unbounded. Crown households never reach this code — they
//   paid, and the ceiling exists to protect the free tier from scripts, not to
//   ration a feature someone bought.
//
//   IT IS A RATE LIMIT, NOT A LIFETIME QUOTA, deliberately. A lifetime quota
//   would eventually tell a real customer their twenty-first guide gets no free
//   sheet, which retires the product's promise that EVERY guide gets one. A
//   rolling window never retires it: the sheet is still owed, and the answer to
//   someone who reaches the ceiling is "shortly", never "no".
//
//   CONCURRENCY: CLAIM THE SLOT BEFORE SPENDING IT. The count reads COMMITTED
//   ledger rows and nothing serializes the read against the write, so WHERE the
//   row is written decides how wide the race is. Writing it last, after the AI
//   call — as this function once did — left the whole generation window open:
//   every request that started inside it read the same count, passed, and
//   billed. The per-guide marker narrowed nothing there, because it is written
//   at the end too. The insert now happens BEFORE the Anthropic call and is DELETED again
//   if the call fails, so an in-flight generation is visible to every other
//   request's count while costing a failed one nothing. What is left is the few
//   milliseconds between the count read and the claim insert — two requests can
//   still both read 7 and both claim — so the slack is "requests that overlapped
//   by a millisecond", not "everything that started during a ten-second
//   generation". Closing that last sliver needs a lock or a constraint the
//   rolling count cannot express; at 8 an hour it is not worth one.
//
//   WHAT A CLAIM COSTS IF THE PROCESS DIES. Between the claim and its release
//   the function can be killed outright — crash, wall-clock timeout, isolate
//   evicted mid-call — and that row then leaks: it counts against the account
//   until it ages out of the window (an hour for the burst bound, a day for the
//   daily one). Accepted deliberately, not overlooked:
//     * it errs STRICT, never loose. A leak can only refuse a generation the
//       user was entitled to; it can never admit one past the ceiling, and the
//       loose direction is the only one that costs money.
//     * it costs one slot of 8 an hour / 20 a day and expires on its own. There
//       is no lifetime quota for it to subtract from permanently.
//     * the product promise survives it. guides.free_generation_used_at is
//       still stamped only after a sheet is stored, so a leaked claim never
//       burns the guide's free sheet — at worst that user waits.
//     * the alternative — a "pending" flag on 0014 plus a reaper to sweep stale
//       claims — is a schema change, a scheduled job, and a deliberate hole in
//       which pending rows do not count, bought to fix something that heals
//       itself inside a day.
//
// The sheet is STORED UNWATERMARKED and `watermark` is only a render-time
// instruction. Unlocking Crown therefore reveals the sheet the user already
// has — instantly, with no regeneration and no second AI charge.
//
// Security model:
//   * Every database query about the caller's data runs through a client built
//     with the ANON key plus the caller's own Authorization header, so RLS
//     decides what the caller can see and write.
//   * The exceptions are the two pieces of paywall state, both read and
//     written through a service-role client built only on the free path (see
//     the paywall block below), because both would be worthless if the
//     `authenticated` role could touch them:
//       - guides.free_generation_used_at, ONE column, and only ever on the
//         single guide id the RLS-scoped load above proved the caller can
//         reach. If clients could write it the allowance would be trivially
//         resettable and the paywall decorative.
//       - public.ai_free_generations, the rate-ceiling ledger, which has no
//         API-role grants at all (0014) and so is reachable by no other means.
//         The count and the claim insert are both filtered to the CALLER'S OWN
//         user_id, resolved from their JWT, and the one delete — releasing a
//         claim whose generation never happened — names by primary key the row
//         this same request created moments earlier, and nothing else.
//     Neither escalation leaves the caller's own data, so neither answers a
//     question the caller could not already answer about themselves.
//   * ZERO-CREDENTIAL prompt: every sensitive home value (door/alarm/garage/
//     gate/mailbox codes, spare-key location, WiFi password) is replaced by a
//     [[TOKEN]] placeholder before the prompt leaves our infrastructure. The
//     stored cheat sheet contains only tokens; the app substitutes real
//     values at display time (src/lib/cheatSheetTokens.ts — names in sync).
//
// Secrets: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-provided by the platform.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-opus-5';

// Free-tier rate ceiling — per ACCOUNT (auth.uid()), rolling, counted from the
// ai_free_generations ledger, enforced only on the free path. The header argues
// the numbers; in one line: a six-pet, four-guide setup session spends four of
// the eight hourly slots, and a script exhausts both windows immediately.
// Raising these raises our worst-case Anthropic bill per account per day in
// direct proportion (~4 cents a generation).
const FREE_BURST_WINDOW_MS = 60 * 60 * 1000;
const FREE_BURST_LIMIT = 8;
const FREE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FREE_DAILY_LIMIT = 20;

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

// ----------------------------------------------------------------------------
// Prompt building — ported from petsitter/src/services/AIService.ts
// ----------------------------------------------------------------------------

interface FeedingEntry {
  time?: string;
  amount?: string;
  food_type?: string;
  notes?: string;
}

interface Medication {
  name?: string;
  dosage?: string;
  frequency?: string;
  // The clock times the dose is actually given (HH:mm). Dropping this from
  // the local interface is what silently cost a sitter a dosing schedule: the
  // guide stored 07:30/19:30, the prompt could not name either, and the sheet
  // said "Evening: second dose" with no time. Keep this in sync with
  // Medication in petsitter/src/types/index.ts.
  times?: string[];
  with_food?: boolean;
  notes?: string;
}

/** Mirrors HealthProtocol / HealthSymptom in petsitter/src/types/index.ts. */
interface HealthSymptom {
  name?: string;
  is_enabled?: boolean;
  notes?: string;
}

interface HealthProtocol {
  symptoms?: HealthSymptom[];
  general_notes?: string;
  vet_call_threshold?: string;
}

/** Mirrors PetPersonality in petsitter/src/types/index.ts. */
interface PetPersonality {
  energy_level?: string;
  sociability_people?: string;
  sociability_pets?: string;
  fears?: string;
  bad_habits?: string;
  comfort_items?: string;
  favorite_toys?: string;
  known_commands?: string;
}

interface PetRow {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  age?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  // Selected to EXCLUDE memorialised pets, never printed. Nothing filters
  // guide.pet_ids by status, so a pet moved to Memorial that is still listed on
  // an old guide would otherwise be written into the sheet as a live animal
  // with a full feeding and medication schedule.
  status?: string | null;
  nicknames?: string | null;
  sex?: string | null;
  is_neutered?: boolean | null;
  color_markings?: string | null;
  microchip_id?: string | null;
  license_tag?: string | null;
  feeding_schedule?: FeedingEntry[] | null;
  medications?: Medication[] | null;
  personality?: PetPersonality | null;
  behavioral_notes?: string | null;
  special_instructions?: string | null;
  medical_notes?: string | null;
  health_protocol?: HealthProtocol | null;
  // emergency_phone and address were missing here, so the after-hours number
  // never reached a sheet that exists partly for emergencies.
  vet_info?: {
    name?: string;
    clinic?: string;
    phone?: string;
    address?: string;
    emergency_phone?: string;
  } | null;
  insurance?: {
    provider?: string;
    policy_number?: string;
    claims_phone?: string;
    coverage_notes?: string;
  } | null;
}

interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  contact_type?: string;
  is_primary?: boolean;
  // Which neighbour can actually let you in — decision-relevant during an
  // incident, and previously dropped.
  has_key?: boolean;
  notes?: string;
}

/** Mirrors RoutineTask / DailyRoutine in petsitter/src/types/index.ts. */
interface RoutineTask {
  title?: string;
  time_block?: string;
  time?: string;
  description?: string;
  notes?: string;
  category?: string;
}

/** Mirrors the parts of HomeCare a sitter has to act on. */
interface HomeCareRow {
  systems?: {
    name?: string;
    location?: string;
    instructions?: string;
    emergency_shutoff?: string;
  }[];
  tasks?: {
    title?: string;
    frequency?: string;
    instructions?: string;
  }[];
  supplies?: { name?: string; location?: string; notes?: string }[];
}

interface GuideRow {
  id: string;
  // Crown entitlement scope, and recorded on the ledger row as a diagnostic.
  // Nullable since 0006, and the code below never assumes otherwise.
  household_id: string | null;
  title: string;
  pet_ids: string[] | null;
  start_date: string | null;
  end_date: string | null;
  emergency_contacts: EmergencyContact[] | null;
  home_info: Record<string, string | undefined> | null;
  // The prompt's FIRST requested section is "Daily Schedule", and it was being
  // synthesised only from feeding and medication times — every walk, litter
  // change and play session the owner entered was invisible to the model.
  daily_routine?: { tasks?: RoutineTask[] } | null;
  home_care?: HomeCareRow | null;
  travel_itinerary?: {
    contact_while_away?: string;
    timezone_difference?: string;
    notes?: string;
  } | null;
  additional_notes: string | null;
}

// Presence test for the owner-authored free-text fields below. Explicit rather
// than truthiness on the value: these strings are copied verbatim into the
// prompt, so the only thing worth suppressing is a value with no characters in
// it — one that would print a separator ("Note: ") introducing nothing.
const hasText = (value?: string | null): boolean =>
  value != null && value.trim() !== '';

function buildPrompt(guide: GuideRow, pets: PetRow[]): string {
  const petInfo = pets
    .map((pet) => {
      // Guarded the same way the medication line is: a schedule entry missing
      // a time or an amount must not render "undefined: undefined of kibble".
      const feedingInfo = (pet.feeding_schedule ?? [])
        .map((f) => {
          const when = hasText(f.time) ? `${f.time}: ` : '';
          const amount = hasText(f.amount) ? f.amount : '';
          const food = hasText(f.food_type)
            ? `${amount ? ' of ' : ''}${f.food_type}`
            : '';
          const note = hasText(f.notes) ? ` (${f.notes})` : '';
          const body = `${amount}${food}`.trim();
          return `  - ${when}${body || 'See notes'}${note}`;
        })
        .join('\n');

      const medInfo = (pet.medications ?? [])
        .map((m) => {
          // times is optional AND may be an empty array, so the " at ..."
          // clause is emitted only when a time survives — a medication with no
          // scheduled times must not render a dangling separator.
          const times = (m.times ?? []).filter(hasText);
          const at = times.length > 0 ? ` at ${times.join(' and ')}` : '';
          const withFood = m.with_food === true ? ' (give with food)' : '';
          // The note is the owner's dosing method and escalation rule ("hide
          // it in the pate", "call the vet if she brings it back up"). It is
          // the one part of a medication a sitter cannot reconstruct.
          const note = hasText(m.notes) ? ` — Note: ${m.notes}` : '';
          return `  - ${m.name}: ${m.dosage}, ${m.frequency}${at}${withFood}${note}`;
        })
        .join('\n');

      // The owner's symptom watch-list and escalation rules (pets.health_protocol).
      // Disabled symptoms are dropped: the owner switched those off on purpose.
      // The whole block is omitted when it has nothing in it, so a pet without a
      // protocol contributes no empty heading for the model to answer with a
      // generic "call the owner".
      const health = pet.health_protocol;
      const symptomInfo = (health?.symptoms ?? [])
        .filter((s) => s.is_enabled === true)
        .map((s) => `  - ${s.name}${hasText(s.notes) ? `: ${s.notes}` : ''}`)
        .join('\n');
      const healthProtocolInfo = [
        symptomInfo.length > 0 ? `Watch For:\n${symptomInfo}` : '',
        hasText(health?.vet_call_threshold)
          ? `When To Call The Vet: ${health?.vet_call_threshold}`
          : '',
        hasText(health?.general_notes)
          ? `Health Protocol Notes: ${health?.general_notes}`
          : '',
      ]
        .filter((line) => line.length > 0)
        .join('\n');

      // Temperament the owner recorded FOR a sitter: what scares the pet, what
      // it does when unsupervised, the words it responds to. Dropping this was
      // the same interface-drift that cost the dosing schedule.
      const p = pet.personality;
      const personalityInfo = [
        hasText(p?.fears) ? `  - Afraid of: ${p?.fears}` : '',
        hasText(p?.bad_habits) ? `  - Watch out for: ${p?.bad_habits}` : '',
        hasText(p?.known_commands) ? `  - Responds to: ${p?.known_commands}` : '',
        hasText(p?.comfort_items) ? `  - Comforted by: ${p?.comfort_items}` : '',
        hasText(p?.favorite_toys) ? `  - Favourite toys: ${p?.favorite_toys}` : '',
        hasText(p?.energy_level) ? `  - Energy level: ${p?.energy_level}` : '',
        hasText(p?.sociability_people) ? `  - With people: ${p?.sociability_people}` : '',
        hasText(p?.sociability_pets) ? `  - With other pets: ${p?.sociability_pets}` : '',
      ]
        .filter((l) => l.length > 0)
        .join('\n');

      // The set a sitter needs to describe or reclaim a pet that gets out while
      // the owner is unreachable.
      const identityInfo = [
        hasText(pet.nicknames) ? `Also answers to: ${pet.nicknames}` : '',
        hasText(pet.color_markings) ? `Colour/markings: ${pet.color_markings}` : '',
        hasText(pet.sex)
          ? `Sex: ${pet.sex}${pet.is_neutered === true ? ' (neutered)' : ''}`
          : '',
        hasText(pet.microchip_id) ? `Microchip: ${pet.microchip_id}` : '',
        hasText(pet.license_tag) ? `Licence tag: ${pet.license_tag}` : '',
      ]
        .filter((l) => l.length > 0)
        .join('\n');

      const v = pet.vet_info;
      const vetLine = v
        ? [
            `${v.name ?? ''}${hasText(v.clinic) ? ` at ${v.clinic}` : ''}`.trim(),
            hasText(v.phone) ? `- ${v.phone}` : '',
            hasText(v.emergency_phone) ? `(after hours: ${v.emergency_phone})` : '',
            hasText(v.address) ? `— ${v.address}` : '',
          ]
            .filter((s) => s.length > 0)
            .join(' ')
        : 'Not specified';

      // Only what is useful at a clinic counter; coverage_notes is the owner's
      // own summary of what the policy will and will not pay for.
      const ins = pet.insurance;
      const insuranceInfo = [
        hasText(ins?.provider) ? `Insurer: ${ins?.provider}` : '',
        hasText(ins?.policy_number) ? `Policy: ${ins?.policy_number}` : '',
        hasText(ins?.claims_phone) ? `Claims: ${ins?.claims_phone}` : '',
        hasText(ins?.coverage_notes) ? `Coverage notes: ${ins?.coverage_notes}` : '',
      ]
        .filter((l) => l.length > 0)
        .join('\n');

      return `
Pet: ${pet.name}
Species: ${pet.species}${pet.breed ? ` (${pet.breed})` : ''}
${pet.age != null ? `Age: ${pet.age} years` : ''}
${pet.weight != null ? `Weight: ${pet.weight} ${pet.weight_unit || 'lbs'}` : ''}
${identityInfo}

Feeding Schedule:
${feedingInfo || '  No specific schedule'}

Medications:
${medInfo || '  None'}

${personalityInfo.length > 0 ? `Temperament:\n${personalityInfo}` : ''}
${pet.behavioral_notes ? `Behavioral Notes: ${pet.behavioral_notes}` : ''}
${pet.special_instructions ? `Special Instructions: ${pet.special_instructions}` : ''}
${pet.medical_notes ? `Medical Notes: ${pet.medical_notes}` : ''}
${healthProtocolInfo}

Veterinarian: ${vetLine}
${insuranceInfo}
`;
    })
    .join('\n---\n');

  const emergencyContacts = (guide.emergency_contacts ?? [])
    .map((c) => {
      // has_key is the one a sitter locked out at 10pm actually needs, and
      // contact_type separates the emergency vet from a neighbour.
      const key = c.has_key === true ? ' [HAS A KEY]' : '';
      const kind = hasText(c.contact_type) ? ` [${c.contact_type}]` : '';
      const email = hasText(c.email) ? `, ${c.email}` : '';
      const note = hasText(c.notes) ? ` — ${c.notes}` : '';
      return `- ${c.name} (${c.relationship}): ${c.phone}${email}${
        c.is_primary ? ' [PRIMARY]' : ''
      }${key}${kind}${note}`;
    })
    .join('\n');

  // The owner's OWN schedule — walks, litter, play, medication reminders they
  // wrote by hand. The prompt asks the model for a "Daily Schedule" first, and
  // until now it had only feeding and medication times to build one from.
  const routineInfo = (guide.daily_routine?.tasks ?? [])
    .map((t) => {
      const when = hasText(t.time)
        ? t.time
        : hasText(t.time_block)
          ? t.time_block
          : '';
      const detail = hasText(t.description) ? `: ${t.description}` : '';
      const note = hasText(t.notes) ? ` (${t.notes})` : '';
      return `  - ${when ? `${when} — ` : ''}${t.title ?? ''}${detail}${note}`;
    })
    .join('\n');

  // Not pet care, but it is what the sitter is standing in the middle of:
  // where the bins go, which plant needs water, and where the water shutoff is
  // when something is leaking at midnight.
  const hc = guide.home_care;
  const homeCareInfo = [
    (hc?.tasks ?? []).length > 0
      ? `Household tasks:\n${(hc?.tasks ?? [])
          .map(
            (t) =>
              `  - ${t.title ?? ''}${hasText(t.frequency) ? ` (${t.frequency})` : ''}${
                hasText(t.instructions) ? `: ${t.instructions}` : ''
              }`
          )
          .join('\n')}`
      : '',
    (hc?.systems ?? []).length > 0
      ? `Home systems:\n${(hc?.systems ?? [])
          .map(
            (s) =>
              `  - ${s.name ?? ''}${hasText(s.location) ? ` (${s.location})` : ''}${
                hasText(s.instructions) ? `: ${s.instructions}` : ''
              }${hasText(s.emergency_shutoff) ? ` — SHUTOFF: ${s.emergency_shutoff}` : ''}`
          )
          .join('\n')}`
      : '',
    (hc?.supplies ?? []).length > 0
      ? `Supplies:\n${(hc?.supplies ?? [])
          .map(
            (s) =>
              `  - ${s.name ?? ''}${hasText(s.location) ? ` — ${s.location}` : ''}${
                hasText(s.notes) ? ` (${s.notes})` : ''
              }`
          )
          .join('\n')}`
      : '',
  ]
    .filter((l) => l.length > 0)
    .join('\n');

  // Only the reachability fields. Flights and hotels are the owner's business;
  // how to reach them, and what time it is where they are, is the sitter's.
  const ti = guide.travel_itinerary;
  const travelInfo = [
    hasText(ti?.contact_while_away)
      ? `Reaching the owner: ${ti?.contact_while_away}`
      : '',
    hasText(ti?.timezone_difference)
      ? `Time difference: ${ti?.timezone_difference}`
      : '',
    hasText(ti?.notes) ? `Travel notes: ${ti?.notes}` : '',
  ]
    .filter((l) => l.length > 0)
    .join('\n');

  // SECURITY: NO credential or house-opening value is ever sent to the AI
  // provider — not door/alarm/garage/gate/mailbox codes, not the spare-key
  // location, not the WiFi password. Each sensitive field present in the
  // guide is represented by a [[TOKEN]] placeholder; the model composes the
  // sheet around the tokens, the stored cheat_sheets row contains only
  // tokens, and the app substitutes the real values AT DISPLAY TIME from the
  // guide (src/lib/cheatSheetTokens.ts — token names must stay in sync).
  // The reader gets a complete sheet; Anthropic gets nothing that opens the
  // house or joins the network. The address and WiFi network NAME stay
  // verbatim: needed in context, and neither is a credential.
  const home = guide.home_info ?? {};
  const token = (name: string, value?: string) =>
    value ? `[[${name}]]` : 'Not provided';

  const homeInfo = `
Address: ${home.address || 'Not provided'}
WiFi Network: ${home.wifi_name || 'Not provided'}
WiFi Password: ${token('WIFI_PASSWORD', home.wifi_password)}
Door Code: ${token('DOOR_CODE', home.door_code)}
Alarm Code: ${token('ALARM_CODE', home.alarm_code)}
Garage Code: ${token('GARAGE_CODE', home.garage_code)}
Gate Code: ${token('GATE_CODE', home.gate_code)}
Mailbox Code: ${token('MAILBOX_CODE', home.mailbox_code)}
Spare Key: ${token('SPARE_KEY_LOCATION', home.spare_key_location)}
Trash Day: ${home.trash_day || 'Not specified'}
${hasText(home.parking_info) ? `Parking: ${home.parking_info}` : ''}
${hasText(home.notes) ? `Home Notes: ${home.notes}` : ''}
`;

  return `You are creating a quick reference "cheat sheet" for a pet sitter. This should be a concise, easy-to-scan summary that the pet sitter can quickly reference while caring for the pets.

Create a well-organized cheat sheet based on the following pet sitter guide information:

GUIDE TITLE: ${guide.title}
DATES: ${guide.start_date || 'Not specified'} to ${guide.end_date || 'Not specified'}

PETS:
${petInfo}

${routineInfo.length > 0 ? `DAILY ROUTINE THE OWNER WROTE (use this as the backbone of the Daily Schedule section, merged with the feeding and medication times above):\n${routineInfo}\n` : ''}
EMERGENCY CONTACTS:
${emergencyContacts || 'None provided'}

HOME INFORMATION:
${homeInfo}
${homeCareInfo.length > 0 ? `\nHOME CARE:\n${homeCareInfo}\n` : ''}${travelInfo.length > 0 ? `\nWHILE THE OWNER IS AWAY:\n${travelInfo}\n` : ''}
${guide.additional_notes ? `ADDITIONAL NOTES:\n${guide.additional_notes}` : ''}

Build the cheat sheet with these sections in this order, skipping any with nothing to say:

## ⏰ Daily Schedule   (one subsection per pet if there are several)
## 💊 Medications
## 🚨 Emergency Contacts
## 🔑 Home Access
## ⚠️ Important Reminders

End with "## ❓ Ask the Owner" ONLY if essential information is genuinely missing.

STRICT FORMATTING RULES:
- Use ONLY these constructs: "## " section headings (emoji + short title as shown above), "**Label:** value" lines, and "- " bullets. Keep lines short and scannable on a phone.
- NEVER use markdown tables — do not output the | character at all.
- NEVER use horizontal rules — do not output lines of dashes.
- No HTML. Bold the truly critical values: times, doses, phone numbers.
- Keep the whole sheet tight — a fridge-door reference that fits on 1-2 printed pages.

STRICT CONTENT RULES — a sitter reading the sheet cannot tell your words from the owner's, so every word has to be the owner's:
- Everything on the sheet must trace back to the guide information above. Reorganise it, condense it, and make it clearer to act on; do not add to it.
- Do NOT add care guidance, handling or hygiene precautions, dosing advice, or breed-, species-, or age-specific tips of your own, however sound and however standard. If the owner did not write it, it does not go on the sheet.
- Do NOT invent a time, amount, dose, route, or reason that is not stated above, and do not turn a general instruction into a specific one.
- If something essential really is missing, the ONLY place to raise it is "## ❓ Ask the Owner" — and never list something there that the information above already answers.

STRICT PLACEHOLDER RULES:
- The ONLY placeholders that exist are the exact [[ALL_CAPS]] strings appearing in HOME INFORMATION above. Where such a value belongs, copy its placeholder character for character.
- NEVER invent a new [[...]] placeholder of your own, and never wrap any other text in double brackets.
- Never invent a code, password, or location. For a field marked "Not provided", either leave it out or tell the sitter to ask the owner.`;
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

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

  let guideId: unknown;
  try {
    const body = await req.json();
    guideId = body?.guideId;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof guideId !== 'string' || guideId.length === 0) {
    return json(400, { error: 'bad_request' });
  }
  // Non-UUID ids would reach Postgres as a 22P02 cast error and surface as a
  // noisy 500; 404 keeps malformed and missing indistinguishable.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      guideId
    )
  ) {
    return json(404, { error: 'guide_not_found' });
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

  // Load the guide. RLS makes "not mine" and "does not exist"
  // indistinguishable — both come back as no rows — so both are 404.
  const { data: guide, error: guideError } = await supabase
    .from('guides')
    .select(
      'id, household_id, title, pet_ids, start_date, end_date, emergency_contacts, home_info, daily_routine, home_care, travel_itinerary, additional_notes'
    )
    .eq('id', guideId)
    .maybeSingle();
  if (guideError) {
    console.error('guide load failed:', guideError.message);
    return json(500, { error: 'internal' });
  }
  if (!guide) {
    return json(404, { error: 'guide_not_found' });
  }

  // --------------------------------------------------------------------------
  // Paywall
  // --------------------------------------------------------------------------
  // Crown entitlement check for the guide's household. Membership-gated, so a
  // guide with no household (or one the caller somehow isn't in) reads FALSE.
  const { data: hasCrown, error: crownError } = await supabase.rpc('has_crown', {
    h: guide.household_id,
  });
  if (crownError) {
    console.error('has_crown failed:', crownError.message);
    return json(500, { error: 'internal' });
  }

  // Privileged client for the two pieces of paywall state — the per-guide
  // marker and the per-account ledger — created only on the free path, because
  // a Crown generation must not fail over bookkeeping it never touches. It
  // never widens what the caller can reach: one column on guide.id (which the
  // RLS-scoped load above already resolved for them), and ai_free_generations
  // rows for the caller's own user_id — counted, claimed, and the claim deleted
  // again by primary key if the generation it was taken for never happens.
  let admin: SupabaseClient | null = null;
  // The rate-ceiling scope key, resolved from the caller's JWT below.
  let userId: string | null = null;
  // Id of the ledger row claimed BEFORE the Anthropic call, so that in-flight
  // generations are visible to every other request's count. Null until claimed,
  // and null again once released.
  let claimId: string | null = null;
  let watermark = false;

  // Give the claim back. Called on every path that does NOT end in a billed,
  // stored sheet, which is what keeps "a failed generation costs the user
  // nothing" true. Never throws and never changes the response: by the time it
  // runs, the outcome the caller sees is already decided.
  const releaseClaim = async (reason: string): Promise<void> => {
    if (!admin || !claimId) return;
    const id = claimId;
    claimId = null; // never release the same row twice
    const { error } = await admin
      .from('ai_free_generations')
      .delete()
      .eq('id', id);
    if (error) {
      console.error(
        `free-generation claim ${id} NOT released after ${reason}: ${error.message} — it counts against the user until it ages out of the window`
      );
    }
  };

  if (hasCrown !== true) {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error(
        'SUPABASE_SERVICE_ROLE_KEY missing — cannot enforce the free allowance'
      );
      return json(500, { error: 'internal' });
    }
    admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: marker, error: markerError } = await admin
      .from('guides')
      .select('free_generation_used_at')
      .eq('id', guide.id)
      .maybeSingle();
    if (markerError) {
      console.error('free-allowance read failed:', markerError.message);
      return json(500, { error: 'internal' });
    }
    // != null, not truthiness: this is a timestamp we either have or don't.
    if (marker?.free_generation_used_at != null) {
      return json(402, { error: 'crown_required' });
    }

    // ------------------------------------------------------------------------
    // Free-tier rate ceiling — per ACCOUNT, from the ai_free_generations ledger
    // ------------------------------------------------------------------------
    // Checked AFTER the per-guide marker — a guide whose allowance is already
    // spent is refused either way, and it should not consult, let alone appear
    // to consume, the account's rate window — and entirely BEFORE the Anthropic
    // call, which is the whole point: no request reaches a billable call
    // without first passing this count AND claiming a slot in it.
    //
    // Scope: auth.uid(), and nothing else. The header explains at length why
    // the guide and the household were both wrong (a client can mint either for
    // free, so neither bounds an ACCOUNT); the short version is that this is
    // the only key in the request whose supply is limited, because an account
    // needs a confirmable email. The platform already verified the JWT — this
    // resolves it to the user id.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    userId = userData?.user?.id ?? null;
    if (userError || !userId) {
      // Not a fall-through: an unidentified caller is one the ceiling cannot
      // count, and letting them past would hand back exactly the unlimited free
      // generation this block exists to stop.
      console.error(
        `cannot resolve caller for the free-tier ceiling: ${userError?.message ?? 'no user on the token'}`
      );
      return json(401, { error: 'unauthorized' });
    }

    // One read covers both windows: fetch the day's ledger rows and count the
    // hour inside it. Bounded by this very ceiling in steady state (≤ 20 rows),
    // and served by 0014's (user_id, created_at) index.
    const { data: recent, error: recentError } = await admin
      .from('ai_free_generations')
      .select('created_at')
      .eq('user_id', userId)
      .gt('created_at', new Date(Date.now() - FREE_DAILY_WINDOW_MS).toISOString());
    if (recentError) {
      console.error('free-tier rate read failed:', recentError.message);
      return json(500, { error: 'internal' });
    }

    const now = Date.now();
    const stamps = (recent ?? [])
      .map((row) => Date.parse(String(row.created_at)))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const burst = stamps.filter((t) => t > now - FREE_BURST_WINDOW_MS);

    // When a window holds N ≥ LIMIT rows, the one that must age out before the
    // account drops back under the limit is the LIMIT-th newest — so
    // stamps[length - LIMIT] + window is the moment this stops being refused.
    let retryAt: number | null = null;
    if (burst.length >= FREE_BURST_LIMIT) {
      retryAt = burst[burst.length - FREE_BURST_LIMIT] + FREE_BURST_WINDOW_MS;
    }
    if (stamps.length >= FREE_DAILY_LIMIT) {
      const dailyRetryAt =
        stamps[stamps.length - FREE_DAILY_LIMIT] + FREE_DAILY_WINDOW_MS;
      retryAt = retryAt === null ? dailyRetryAt : Math.max(retryAt, dailyRetryAt);
    }

    if (retryAt !== null) {
      const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
      const wait =
        minutes >= 120
          ? `about ${Math.ceil(minutes / 60)} hours`
          : `about ${minutes} minutes`;
      console.warn(
        `free-tier ceiling hit for user ${userId}: ${burst.length} in the last hour, ${stamps.length} in the last day`
      );
      // NOT crown_required: this is not the paywall, and telling a user to pay
      // when what they actually need is to wait would be a lie they might act
      // on. 429 with a concrete wait, and nothing else.
      //
      // Deliberately NO Crown pitch and NO limit numbers in this body. The
      // client refuses to say either on this path (AICheatSheetScreen), for
      // two reasons that apply just as much here: turning a rate limit into a
      // sales moment is a dark pattern — the ceiling exists to stop scripted
      // abuse, not to convert — and publishing the exact numbers hands an
      // attacker the shape of the thing they are trying to stay under. The
      // operator-facing detail belongs in the log line above, which has it.
      return json(429, {
        error: 'free_limit_reached',
        retry_after_minutes: minutes,
        message: `You've made a lot of cheat sheets in a short time. Please try again in ${wait}.`,
      });
    }

    // ------------------------------------------------------------------------
    // CLAIM THE SLOT — before the money is spent, not after
    // ------------------------------------------------------------------------
    // The count above reads COMMITTED rows, so booking this row after the AI
    // call left the whole generation window open: every request that started
    // inside it read the same count, passed, and billed us. Writing it HERE,
    // immediately after the count, makes an in-flight generation visible to
    // every other request's count, and releaseClaim() deletes it again on every
    // exit below that produces no usable sheet — so the burst is bounded by the
    // ceiling instead of by how long a generation takes, and a failure still
    // costs the user nothing. The header covers what this does not fix: the
    // millisecond gap between the count and this insert, and the row that leaks
    // if the function is killed before it can be released.
    //
    // Independent of the per-guide stamp at the end of this file, deliberately:
    // the loser of that compare-and-swap race made a full-price call too, so
    // its claim stands. Tying the two together would make a raced burst free
    // against the ceiling, which is the one thing the ceiling is for.
    //
    // household_id and guide_id are diagnostics only (0014 keeps them FK-free,
    // so a later delete of either cannot take this row with it); user_id is the
    // only column the count reads.
    const { data: claim, error: claimError } = await admin
      .from('ai_free_generations')
      .insert({
        user_id: userId,
        household_id: guide.household_id,
        guide_id: guide.id,
      })
      .select('id')
      .single();
    if (claimError || !claim) {
      // Fail CLOSED. Unlike the old write site this one is BEFORE the spend, so
      // 500 is honest here — nothing has been generated to lie about. A ceiling
      // we cannot record is a ceiling we cannot enforce, and carrying on would
      // make the call unbounded by anything at all.
      console.error(
        `free-generation claim failed for user ${userId}: ${claimError?.message ?? 'insert returned no row'}`
      );
      return json(500, { error: 'internal' });
    }
    claimId = claim.id as string;

    watermark = true;
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    // Checked here rather than before the paywall so the 402/429 answers stay
    // ahead of it, which means a claim may already be held — give it back. A
    // deployment with no key generates nothing and must charge nobody's window
    // for it.
    await releaseClaim('ai_not_configured');
    return json(503, { error: 'ai_not_configured' });
  }

  // Load the guide's pets. RLS-scoped; additionally filtered to guide.pet_ids.
  let pets: PetRow[] = [];
  const petIds = Array.isArray(guide.pet_ids) ? guide.pet_ids : [];
  if (petIds.length > 0) {
    const { data: petRows, error: petsError } = await supabase
      .from('pets')
      .select(
        'id, name, species, status, nicknames, sex, is_neutered, color_markings, microchip_id, license_tag, breed, age, weight, weight_unit, feeding_schedule, medications, personality, behavioral_notes, special_instructions, medical_notes, health_protocol, vet_info, insurance'
      )
      .in('id', petIds);
    if (petsError) {
      console.error('pets load failed:', petsError.message);
      await releaseClaim('the pets load failing');
      return json(500, { error: 'internal' });
    }
    // Memorialised pets are dropped HERE rather than in the query, so a row
    // with a null/absent status (every pet predating the memorial feature)
    // still counts as active. Nothing removes a pet from guide.pet_ids when it
    // is memorialised, so without this an old guide would render a pet that has
    // died as a living animal with a full feeding and medication schedule — the
    // cruellest possible output from a document about caring for it.
    pets = (petRows ?? []).filter((p) => p.status !== 'deceased');
  }

  const prompt = buildPrompt(guide as GuideRow, pets);

  // Call Claude. On claude-opus-5 thinking is on by default (adaptive), and
  // max_tokens caps thinking + response text together, so leave headroom.
  // effort: "low" — this is formatting/summarization over fully-provided
  // structured data with a user waiting in the browser; raise if quality
  // ever underwhelms. fallbacks: "default" is the recommended opt-in: if a
  // safety classifier ever declines (vanishingly unlikely for pet care), the
  // API re-serves the request on Anthropic's recommended fallback model
  // inside the same call instead of failing the generation.
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await anthropic.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`claude request failed: ${detail.slice(0, 500)}`);
    await releaseClaim('the claude request failing');
    return json(502, { error: 'ai_failed' });
  }

  // A refusal is HTTP 200 with stop_reason "refusal" — check before reading
  // content. With fallbacks:"default", reaching here means the whole chain
  // declined.
  if (message.stop_reason === 'refusal') {
    console.error(
      `claude refused (category: ${message.stop_details?.category ?? 'unknown'})`
    );
    await releaseClaim('a claude refusal');
    return json(502, { error: 'ai_failed' });
  }

  // Truncation is NOT a partial success. Thinking is on by default and shares
  // the max_tokens budget with the response text, so a large guide can run out
  // mid-sheet — and `content.length > 0` would happily pass. Storing that would
  // hand a sitter a printed document cut off mid-instruction, potentially
  // mid-medication-dose, with nothing marking it incomplete. Fail instead; the
  // client already treats 502 as retryable.
  if (message.stop_reason === 'max_tokens') {
    console.error('claude hit max_tokens — refusing to store a truncated sheet');
    await releaseClaim('a truncated sheet');
    return json(502, { error: 'ai_failed' });
  }

  const content = message.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('');
  if (content.length === 0) {
    console.error('claude returned no text content');
    await releaseClaim('an empty sheet');
    return json(502, { error: 'ai_failed' });
  }

  // Upsert the cheat sheet through the user-scoped client — RLS enforces
  // household membership on the write. generated_at is set explicitly because
  // the column default only applies on INSERT, not on the update path.
  const { error: upsertError } = await supabase.from('cheat_sheets').upsert(
    {
      guide_id: guide.id,
      content,
      model_used: CLAUDE_MODEL,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'guide_id' }
  );
  if (upsertError) {
    // The claim is deliberately NOT released here — the only failure below the
    // AI call that keeps it. The sheet was generated and billed; releasing it
    // would let a caller loop full-price generations against a persistently
    // broken write with nothing counting them, which is precisely the spend the
    // ceiling exists to bound.
    console.error('cheat_sheets upsert failed:', upsertError.message);
    return json(500, { error: 'internal' });
  }

  // Burn THIS GUIDE's free sheet — LAST, and only now (rule 1). Rule 2's ledger
  // row is already written: it was claimed up in the paywall block, before the
  // AI call, so that in-flight generations count against the ceiling, and every
  // failing exit between there and here gave it back — except the storage
  // failure just above, which keeps it because that call was billed. Only the
  // per-guide marker is left to write.
  //
  // The two rules stay independent (see header): this stamp says "this guide
  // has had its free sheet", the claim above says "this account spent a free AI
  // call", and neither is conditional on the other.
  if (watermark && admin) {
    // Rule 1. The race: two tabs can both read a NULL marker and both start
    // generating. The `.is(..., null)` makes this a compare-and-swap, so only
    // the first stamp lands and the others come back having matched no rows. We
    // deliberately do NOT pre-stamp to close that window, even though the rate
    // ceiling now does exactly that with its ledger row. The two are not
    // symmetric: a ledger claim leaked by a killed function ages out of a
    // rolling window within the day, whereas a leaked marker would take this
    // guide's one free sheet away permanently — there is no window for it to
    // expire from. So the marker keeps the safe ordering, and the window costs
    // us only a duplicate AI call per tab that raced, each of which claimed its
    // own ledger row and is therefore counted. Nobody gets a SECOND free sheet
    // either way: once this runs, the marker is set for the guide.
    const { data: stamped, error: stampError } = await admin
      .from('guides')
      .update({ free_generation_used_at: new Date().toISOString() })
      .eq('id', guide.id)
      .is('free_generation_used_at', null)
      .select('id');
    if (stampError) {
      // The sheet exists and is the user's — returning 500 here would tell them
      // generation failed when it plainly didn't, and would still leave the
      // marker unset. Log loudly instead: an unstamped guide keeps handing out
      // free generations.
      console.error(
        `free-allowance stamp failed for guide ${guide.id}: ${stampError.message}`
      );
    } else if ((stamped?.length ?? 0) === 0) {
      // Expected under the race above — a concurrent generation already
      // stamped it. Nothing to fix.
      console.log(`free allowance for guide ${guide.id} was already claimed`);
    }
  }

  return json(200, { content, watermark });
});
