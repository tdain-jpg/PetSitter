import { showAlert, showConfirm } from './dialogs';
import type { Household, PendingInvite } from '../types';

/**
 * Tell a fresh joiner which household new pets and guides will land in, and
 * offer the one-tap switch when their existing default won.
 *
 * Shared by every accept surface (the Home gate, the Home banner, the
 * Household screen) because the server — not the button that was tapped —
 * decides the destination: migration 0011 adopts the joined household only
 * when the joiner's current default is empty. An established user accepting
 * from the Home banner is exactly the person who needs telling, and having
 * that dialog on one screen but not the other meant the same invite produced
 * opposite outcomes.
 *
 * `destinationId` is respondToInvite's resolved value. Null means "we could
 * not find out", and the correct degradation is to say nothing rather than
 * guess — see the comment on that read in DataContext.
 *
 * `formatError` is the calling screen's own RPC-message mapper, so the
 * switch's failure alert reads in that screen's voice.
 */
export async function announceJoinDestination(options: {
  invite: PendingInvite;
  destinationId: string | null;
  households: Household[];
  setPrimaryHousehold: (householdId: string) => Promise<void>;
  formatError: (raw: unknown, fallback: string) => string;
}): Promise<void> {
  const { invite, destinationId, households, setPrimaryHousehold, formatError } = options;
  if (!destinationId) return;

  if (destinationId === invite.household_id) {
    await showAlert(
      `You joined ${invite.household_name}`,
      `New pets and guides you add now go to ${invite.household_name}, so everyone there can see them.`
    );
    return;
  }

  // Their existing default won. Offer the switch here rather than leaving
  // them to find it on a card further down the screen.
  const currentName = households.find((h) => h.id === destinationId)?.name;
  const switchNow = await showConfirm({
    title: `You joined ${invite.household_name}`,
    message: currentName
      ? `New pets and guides you add will still go to ${currentName} — nobody in ${invite.household_name} will see them. Add new ones to ${invite.household_name} instead?`
      : `Add new pets and guides to ${invite.household_name} so everyone there can see them?`,
    confirmLabel: `Use ${invite.household_name}`,
    cancelLabel: currentName ? `Keep ${currentName}` : 'Not now',
  });
  if (!switchNow) return;

  try {
    await setPrimaryHousehold(invite.household_id);
  } catch (error: any) {
    // Its own alert: the join itself succeeded, so the caller's generic
    // "could not respond to the invitation" copy would be a lie.
    showAlert(
      'Could not change default',
      formatError(error?.message, 'Something went wrong. Please try again.')
    );
  }
}
