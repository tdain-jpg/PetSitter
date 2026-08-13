import type { Guide, Pet } from '../types';

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

/**
 * Generate a pet sitter cheat sheet using Google Gemini
 */
export async function generateCheatSheet(
  guide: Guide,
  pets: Pet[],
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Please add it in Settings.');
  }

  // Build the prompt with guide and pet information
  const prompt = buildPrompt(guide, pets);

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The API key travels in a header, never the URL: query strings
          // leak into browser history, proxy/access logs, and Referer headers.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `API request failed: ${response.status}`
      );
    }

    const data: GeminiResponse = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('No content generated');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error: any) {
    if (error.message.includes('API key')) {
      throw error;
    }
    throw new Error(`Failed to generate cheat sheet: ${error.message}`);
  }
}

function buildPrompt(guide: Guide, pets: Pet[]): string {
  const petInfo = pets.map((pet) => {
    const feedingInfo = pet.feeding_schedule
      .map((f) => `  - ${f.time}: ${f.amount} of ${f.food_type}${f.notes ? ` (${f.notes})` : ''}`)
      .join('\n');

    const medInfo = pet.medications
      .map((m) => `  - ${m.name}: ${m.dosage}, ${m.frequency}${m.with_food ? ' (give with food)' : ''}`)
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
  }).join('\n---\n');

  const emergencyContacts = guide.emergency_contacts
    .map((c) => `- ${c.name} (${c.relationship}): ${c.phone}${c.is_primary ? ' [PRIMARY]' : ''}`)
    .join('\n');

  // SECURITY: physical-access codes (door, alarm, garage, gate, mailbox) are
  // deliberately REDACTED before this prompt leaves the device — it is sent to
  // Google's Gemini API and the generated cheat sheet is stored in plaintext,
  // so real codes must never ride along. "(see guide)" tells the model (and
  // the sitter) that a code exists; the actual value stays in the app/PDF.
  // WiFi credentials and the address are kept: sitters need them verbatim in
  // the summary, and unlike access codes they don't open the house.
  const redactCode = (value?: string) => (value ? '(see guide)' : 'Not provided');

  const homeInfo = `
Address: ${guide.home_info.address || 'Not provided'}
WiFi: ${guide.home_info.wifi_name || 'Not provided'}${guide.home_info.wifi_password ? ` / Password: ${guide.home_info.wifi_password}` : ''}
Door Code: ${redactCode(guide.home_info.door_code)}
Alarm Code: ${redactCode(guide.home_info.alarm_code)}
Garage Code: ${redactCode(guide.home_info.garage_code)}
Gate Code: ${redactCode(guide.home_info.gate_code)}
Mailbox Code: ${redactCode(guide.home_info.mailbox_code)}
Spare Key: ${guide.home_info.spare_key_location || 'Not provided'}
Trash Day: ${guide.home_info.trash_day || 'Not specified'}
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
4. Key home access info — access codes are redacted as "(see guide)"; keep that placeholder text exactly, never invent a code
5. Important reminders and warnings

Format it using markdown with clear sections, bullet points, and bold text for important items. Keep it concise but comprehensive - this should fit on 1-2 pages when printed.`;
}
