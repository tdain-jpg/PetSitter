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
//   503 { error: 'ai_not_configured' }   (GEMINI_API_KEY secret not set)
//   404 { error: 'guide_not_found' }     (missing OR invisible under RLS)
//   502 { error: 'ai_failed' }           (Gemini returned non-200 / no text)
// This function upserts the cheat_sheets row itself before returning.
//
// Security model:
//   * Every database query runs through a client built with the ANON key plus
//     the caller's own Authorization header, so RLS decides what the caller
//     can see and write. There is no service-role access in this function.
//   * The prompt is built SERVER-SIDE and ports src/services/AIService.ts,
//     hardening its redaction stance: physical-access codes (door, alarm,
//     garage, gate, mailbox) AND the spare-key location are NEVER sent to
//     Google — the prompt carries placeholders instead. WiFi name/password
//     and the address are included, matching the existing client behavior.
//
// Secrets: GEMINI_API_KEY (Supabase → Edge Functions → Secrets).
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-provided by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.0-flash';

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
${pet.age ? `Age: ${pet.age} years` : ''}
${pet.weight ? `Weight: ${pet.weight} ${pet.weight_unit || 'lbs'}` : ''}

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

  // SECURITY: physical-access codes (door, alarm, garage, gate, mailbox) AND
  // the spare-key location are deliberately REDACTED before this prompt leaves
  // our infrastructure — it is sent to Google's Gemini API and the generated
  // cheat sheet is stored in plaintext, so nothing that opens the house may
  // ride along (a spare key's hiding spot opens it as surely as a door code).
  // The placeholder tells the model (and the sitter) that the info exists; the
  // actual value stays in the app/PDF. WiFi credentials and the address are
  // kept: sitters need them verbatim in the summary, and they don't open the
  // house.
  const home = guide.home_info ?? {};
  const redactCode = (value?: string) =>
    value ? '(see the full guide for access codes)' : 'Not provided';

  const homeInfo = `
Address: ${home.address || 'Not provided'}
WiFi: ${home.wifi_name || 'Not provided'}${home.wifi_password ? ` / Password: ${home.wifi_password}` : ''}
Door Code: ${redactCode(home.door_code)}
Alarm Code: ${redactCode(home.alarm_code)}
Garage Code: ${redactCode(home.garage_code)}
Gate Code: ${redactCode(home.gate_code)}
Mailbox Code: ${redactCode(home.mailbox_code)}
Spare Key: ${home.spare_key_location ? '(see the full guide for the spare key location)' : 'Not provided'}
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

Please create a cheat sheet that includes:
1. A quick daily schedule summary for each pet
2. Important medications and times
3. Emergency contact quick reference
4. Key home access info — access codes are redacted as "(see the full guide for access codes)" and the spare key as "(see the full guide for the spare key location)"; keep those placeholder texts exactly, never invent a code or location
5. Important reminders and warnings

Format it using markdown with clear sections, bullet points, and bold text for important items. Keep it concise but comprehensive - this should fit on 1-2 pages when printed.`;
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

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
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

  // Call Gemini. The API key travels in a header, never the URL: query strings
  // leak into proxy/access logs.
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );
  } catch (err) {
    console.error('gemini fetch failed:', err instanceof Error ? err.message : err);
    return json(502, { error: 'ai_failed' });
  }

  if (!geminiResponse.ok) {
    const detail = await geminiResponse.text().catch(() => '');
    console.error(`gemini returned ${geminiResponse.status}: ${detail.slice(0, 500)}`);
    return json(502, { error: 'ai_failed' });
  }

  const data = await geminiResponse.json().catch(() => null);
  const content: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || content.length === 0) {
    console.error('gemini returned 200 but no text candidate');
    return json(502, { error: 'ai_failed' });
  }

  // Upsert the cheat sheet through the user-scoped client — RLS enforces
  // household membership on the write. generated_at is set explicitly because
  // the column default only applies on INSERT, not on the update path.
  const { error: upsertError } = await supabase.from('cheat_sheets').upsert(
    {
      guide_id: guide.id,
      content,
      model_used: GEMINI_MODEL,
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
