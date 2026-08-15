import type { HomeInfo } from '../types';

/**
 * AI cheat sheets are generated with [[TOKEN]] placeholders standing in for
 * every sensitive home value — the model (and Anthropic) never sees a real
 * code, and the stored cheat_sheets row contains only tokens. This helper is
 * the other half of that contract: at DISPLAY time (screen, clipboard, PDF)
 * the tokens are replaced with the live values from the guide's home_info,
 * so the reader sees a complete sheet.
 *
 * The token names here must match the ones the generate-cheat-sheet Edge
 * Function emits.
 */
const TOKEN_FIELDS: Record<string, keyof HomeInfo> = {
  '[[WIFI_PASSWORD]]': 'wifi_password',
  '[[DOOR_CODE]]': 'door_code',
  '[[ALARM_CODE]]': 'alarm_code',
  '[[GARAGE_CODE]]': 'garage_code',
  '[[GATE_CODE]]': 'gate_code',
  '[[MAILBOX_CODE]]': 'mailbox_code',
  '[[SPARE_KEY_LOCATION]]': 'spare_key_location',
  // Defensive aliases: the prompt forbids inventing tokens, but a model that
  // pattern-generalizes anyway (seen once: [[WIFI_NETWORK]]) should still
  // resolve to the right value rather than a fallback pointer.
  '[[WIFI_NETWORK]]': 'wifi_name',
  '[[WIFI_NAME]]': 'wifi_name',
  '[[ADDRESS]]': 'address',
  '[[TRASH_DAY]]': 'trash_day',
};

export function fillCheatSheetTokens(
  content: string,
  homeInfo?: HomeInfo | null
): string {
  // Any [[ALL_CAPS]] token is swallowed even if unknown — a raw token must
  // never reach a reader. A value that was removed from the guide after
  // generation degrades to a pointer at the source of truth.
  return content.replace(/\[\[[A-Z_]+\]\]/g, (match) => {
    const field = TOKEN_FIELDS[match];
    const value = field ? homeInfo?.[field] : undefined;
    return value && String(value).trim().length > 0
      ? String(value)
      : '(see the full guide)';
  });
}
