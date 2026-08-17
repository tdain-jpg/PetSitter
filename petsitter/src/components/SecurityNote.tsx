import { Text, Pressable } from 'react-native';
import { showAlert } from '../lib/dialogs';

/**
 * A one-line trust note shown wherever sensitive home values are entered,
 * displayed, or sent near an AI feature, with a tap-through to the full
 * explanation. Tap (not hover) because this is a touch-first app.
 *
 * Placements ("right info, right time"):
 *   entry  — the guide form's Home & Access section, where codes are typed
 *   ai     — the AI Cheat Sheet screen, where AI anxiety peaks
 *   shared — the sitter's share view, where a stranger meets the data
 */
const LEAD: Record<SecurityNoteContext, string> = {
  entry: '🔒 Codes stay between your household and the sitters you share with — never sent to AI.',
  ai: '🔒 Your codes and passwords are never sent to the AI — they’re filled in on your device.',
  shared: '🔒 Sensitive values stay hidden until you reveal them.',
};

const EXPLANATION = `Codes, passwords, and the spare-key location are protected in these ways:

• Encrypted in transit and at rest — values travel over TLS and are stored encrypted.

• Household-only access — database rules allow only members of your household to read them. Sitters see them only through a share link you create, and you can turn any link off at any time.

• Hidden by default for sitters — the shared view masks each sensitive value until the reader taps to reveal it.

• Never sent to AI — when Crown AI writes a cheat sheet, it receives placeholders instead of your real values. The finished sheet is completed on your device, so no code, password, or key location ever reaches the AI provider.`;

export type SecurityNoteContext = 'entry' | 'ai' | 'shared';

export function SecurityNote({ context }: { context: SecurityNoteContext }) {
  return (
    <Pressable
      onPress={() => showAlert('How we protect this', EXPLANATION)}
      accessibilityRole="button"
      accessibilityLabel="How we protect your sensitive information"
      // 32px, and it appears on GuideForm, AICheatSheet and PDFPreview — one
      // component, three screens under the floor.
      style={{ minHeight: 44, justifyContent: 'center' }}
      className="mb-3"
    >
      <Text className="text-xs text-tan-500 leading-4">
        {LEAD[context]}{' '}
        <Text className="text-primary-600 underline">How we protect this</Text>
      </Text>
    </Pressable>
  );
}
