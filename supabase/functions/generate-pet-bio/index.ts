// Edge Function: generate-pet-bio
//
// Writes a short, shareable bio of one pet from what its profile already says
// (agreed with Tim 2026-10-21). Returns the text; nothing is saved here. The
// owner reads it, edits it if they like, and saves it to pets.bio through the
// ordinary pet update.
//
// ADMIN ONLY while it is tested on Clark and Lillee. Remove the is_admin()
// check below to open it to everyone.
//
//   POST { pet_id: uuid, tone: 'warm' | 'funny' | 'pet_voice' }  -> { bio }
//
// Bios are meant to be posted publicly, so the prompt never receives medical
// notes, medications, vet or insurance details, microchip or licence numbers,
// or anything about the owners or their home. It gets only the pet's name,
// kind, look, age, nicknames and personality.
//
// Secrets: ANTHROPIC_API_KEY (shared with generate-cheat-sheet).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-opus-5';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const TONES: Record<string, string> = {
  warm: 'Warm and affectionate, as a proud owner would describe them. Third person.',
  funny: 'Playful and funny, gently teasing their quirks with obvious love. Third person.',
  pet_voice: "Written in the pet's own voice, first person, charming and a little cheeky.",
};

const LEVELS: Record<string, string> = {
  low: 'low', medium: 'medium', high: 'high', very_high: 'very high',
  shy: 'shy', selective: 'selective with other animals', friendly: 'friendly', very_friendly: 'very friendly',
};

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 300) : '');

/** Only the shareable facts, as labelled lines. Anything missing is left out. */
function petFacts(p: Record<string, any>): string {
  const per = (p.personality ?? {}) as Record<string, unknown>;
  const lines: [string, string][] = [
    ['Name', clean(p.name)],
    ['Nicknames', clean(p.nicknames)],
    ['Species', clean(p.species)],
    ['Breed', clean(p.breed)],
    ['Sex', clean(p.sex)],
    ['Age in years', p.age != null && String(p.age).trim() ? String(p.age).trim() : ''],
    ['Coat and markings', clean(p.color_markings)],
    ['Energy level', LEVELS[String(per.energy_level ?? '')] ?? ''],
    ['With people', LEVELS[String(per.sociability_people ?? '')] ?? ''],
    ['With other animals', LEVELS[String(per.sociability_pets ?? '')] ?? ''],
    ['Favorite toys', clean(per.favorite_toys)],
    ['Comfort things', clean(per.comfort_items)],
    ['Commands they know', clean(per.known_commands)],
    ['Fears', clean(per.fears)],
    ['Quirks and habits', clean(per.bad_habits)],
    ['Behavior notes', clean(p.behavioral_notes)],
  ];
  return lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function buildPrompt(facts: string, tone: string): string {
  return `Write a short bio of this pet for its owner to share with friends and on social media.

Tone: ${TONES[tone]}

Rules:
- Use only the facts below. If something is not given, leave it out; never invent a detail, a backstory, a place, or a person.
- 50 to 100 words, one or two short paragraphs.
- Plain American English. No em dashes or en dashes. No hashtags. At most one emoji, and only in the funny or pet's-voice tone.
- Leave out anything an owner would not want strangers to read: accidents indoors, health or medical matters, and any mention of the owners, their names, or where they live.
- Fears and anxieties may be mentioned gently and kindly, or left out.
- Return only the bio text, with no title and no quotation marks.

Facts:
${facts}`;
}

function stripLongDashes(text: string): string {
  return text.replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });

  let petId = '';
  let tone = 'warm';
  try {
    const body = JSON.parse((await req.text()) || '{}');
    petId = String(body?.pet_id ?? '');
    tone = String(body?.tone ?? 'warm');
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (!UUID_RE.test(petId) || !(tone in TONES)) return json(400, { error: 'bad_request' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });

  // Testing gate: admin only until Tim opens it to everyone.
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) return json(403, { error: 'not_available' });

  // Read through the caller's own session, so household RLS decides whether
  // they may see this pet at all. A pet they cannot see is simply not found.
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('name, nicknames, species, breed, sex, age, color_markings, personality, behavioral_notes')
    .eq('id', petId)
    .maybeSingle();
  if (petError || !pet) return json(404, { error: 'pet_not_found' });

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json(503, { error: 'ai_not_configured' });

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await anthropic.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: buildPrompt(petFacts(pet), tone) }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  } catch (err) {
    console.error(`claude request failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 500)}`);
    return json(502, { error: 'ai_failed' });
  }
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    console.error(`bio not produced: ${message.stop_reason}`);
    return json(502, { error: 'ai_failed' });
  }
  const bio = stripLongDashes(
    message.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
  ).replace(/^["“]|["”]$/g, '');
  if (!bio) return json(502, { error: 'ai_failed' });
  return json(200, { bio: bio.slice(0, 2000) });
});
