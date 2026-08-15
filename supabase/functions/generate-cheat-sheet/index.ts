// Edge Function: generate-cheat-sheet
//
// Server-side AI cheat-sheet generation (Crown feature). The browser calls
// this via supabase.functions.invoke('generate-cheat-sheet', { body: { guideId } }),
// so the platform's default JWT verification applies and CORS must be handled.
//
// Contract (other code depends on these exact shapes):
//   POST { guideId: string }  with the user's Authorization header
//   200 { content: string }
//   402 { error: 'crown_required' }
//   503 { error: 'ai_not_configured' }   (ANTHROPIC_API_KEY secret not set)
//   404 { error: 'guide_not_found' }     (missing OR invisible under RLS)
//   502 { error: 'ai_failed' }           (Claude call failed, refused, or empty)
// This function upserts the cheat_sheets row itself before returning.
//
// Security model:
//   * Every database query runs through a client built with the ANON key plus
//     the caller's own Authorization header, so RLS decides what the caller
//     can see and write. There is no service-role access in this function.
//   * ZERO-CREDENTIAL prompt: every sensitive home value (door/alarm/garage/
//     gate/mailbox codes, spare-key location, WiFi password) is replaced by a
//     [[TOKEN]] placeholder before the prompt leaves our infrastructure. The
//     stored cheat sheet contains only tokens; the app substitutes real
//     values at display time (src/lib/cheatSheetTokens.ts — names in sync).
//
// Secrets: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-provided by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-opus-5';

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
  with_food?: boolean;
}

interface PetRow {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  age?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  feeding_schedule?: FeedingEntry[] | null;
  medications?: Medication[] | null;
  behavioral_notes?: string | null;
  special_instructions?: string | null;
  medical_notes?: string | null;
  vet_info?: { name?: string; clinic?: string; phone?: string } | null;
}

interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  is_primary?: boolean;
}

interface GuideRow {
  id: string;
  household_id: string | null;
  title: string;
  pet_ids: string[] | null;
  start_date: string | null;
  end_date: string | null;
  emergency_contacts: EmergencyContact[] | null;
  home_info: Record<string, string | undefined> | null;
  additional_notes: string | null;
}

function buildPrompt(guide: GuideRow, pets: PetRow[]): string {
  const petInfo = pets
    .map((pet) => {
      const feedingInfo = (pet.feeding_schedule ?? [])
        .map(
          (f) =>
            `  - ${f.time}: ${f.amount} of ${f.food_type}${f.notes ? ` (${f.notes})` : ''}`
        )
        .join('\n');

      const medInfo = (pet.medications ?? [])
        .map(
          (m) =>
            `  - ${m.name}: ${m.dosage}, ${m.frequency}${m.with_food ? ' (give with food)' : ''}`
        )
        .join('\n');

      return `
Pet: ${pet.name}
Species: ${pet.species}${pet.breed ? ` (${pet.breed})` : ''}
${pet.age != null ? `Age: ${pet.age} years` : ''}
${pet.weight != null ? `Weight: ${pet.weight} ${pet.weight_unit || 'lbs'}` : ''}

Feeding Schedule:
${feedingInfo || '  No specific schedule'}

Medications:
${medInfo || '  None'}

${pet.behavioral_notes ? `Behavioral Notes: ${pet.behavioral_notes}` : ''}
${pet.special_instructions ? `Special Instructions: ${pet.special_instructions}` : ''}
${pet.medical_notes ? `Medical Notes: ${pet.medical_notes}` : ''}

Veterinarian: ${pet.vet_info ? `${pet.vet_info.name} at ${pet.vet_info.clinic} - ${pet.vet_info.phone}` : 'Not specified'}
`;
    })
    .join('\n---\n');

  const emergencyContacts = (guide.emergency_contacts ?? [])
    .map(
      (c) =>
        `- ${c.name} (${c.relationship}): ${c.phone}${c.is_primary ? ' [PRIMARY]' : ''}`
    )
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
`;

  return `You are creating a quick reference "cheat sheet" for a pet sitter. This should be a concise, easy-to-scan summary that the pet sitter can quickly reference while caring for the pets.

Create a well-organized cheat sheet based on the following pet sitter guide information:

GUIDE TITLE: ${guide.title}
DATES: ${guide.start_date || 'Not specified'} to ${guide.end_date || 'Not specified'}

PETS:
${petInfo}

EMERGENCY CONTACTS:
${emergencyContacts || 'None provided'}

HOME INFORMATION:
${homeInfo}

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
      'id, household_id, title, pet_ids, start_date, end_date, emergency_contacts, home_info, additional_notes'
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

  // Crown entitlement check for the guide's household.
  const { data: hasCrown, error: crownError } = await supabase.rpc('has_crown', {
    h: guide.household_id,
  });
  if (crownError) {
    console.error('has_crown failed:', crownError.message);
    return json(500, { error: 'internal' });
  }
  if (hasCrown !== true) {
    return json(402, { error: 'crown_required' });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return json(503, { error: 'ai_not_configured' });
  }

  // Load the guide's pets. RLS-scoped; additionally filtered to guide.pet_ids.
  let pets: PetRow[] = [];
  const petIds = Array.isArray(guide.pet_ids) ? guide.pet_ids : [];
  if (petIds.length > 0) {
    const { data: petRows, error: petsError } = await supabase
      .from('pets')
      .select(
        'id, name, species, breed, age, weight, weight_unit, feeding_schedule, medications, behavioral_notes, special_instructions, medical_notes, vet_info'
      )
      .in('id', petIds);
    if (petsError) {
      console.error('pets load failed:', petsError.message);
      return json(500, { error: 'internal' });
    }
    pets = petRows ?? [];
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
    return json(502, { error: 'ai_failed' });
  }

  // A refusal is HTTP 200 with stop_reason "refusal" — check before reading
  // content. With fallbacks:"default", reaching here means the whole chain
  // declined.
  if (message.stop_reason === 'refusal') {
    console.error(
      `claude refused (category: ${message.stop_details?.category ?? 'unknown'})`
    );
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
    return json(502, { error: 'ai_failed' });
  }

  const content = message.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('');
  if (content.length === 0) {
    console.error('claude returned no text content');
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
    console.error('cheat_sheets upsert failed:', upsertError.message);
    return json(500, { error: 'internal' });
  }

  return json(200, { content });
});
