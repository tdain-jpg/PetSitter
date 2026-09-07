import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The role a person chose at sign-up, held until there is a session to write it
 * to.
 *
 * Email confirmation is ON, so signUp() does not return a session: the account
 * exists but nobody is signed in, and profiles cannot be written yet. The
 * choice therefore has to survive the gap between "I said I'm a sitter" and
 * "I clicked the link in my email and came back" — which may be on the same
 * device minutes later, or not at all.
 *
 * Deliberately NOT namespaced per user: at the moment it is written there is no
 * user id to namespace it with. It is consumed once, by the first account to
 * sign in on this device afterwards, and cleared whether or not that succeeds.
 * The failure mode is small and self-correcting — someone who signs up as a
 * sitter and then signs in as a different existing account would hand that
 * account a landing preference it can change in one tap — and the alternative,
 * carrying the choice in the confirmation URL, puts it somewhere the user can
 * edit and somewhere it can be logged.
 */

const KEY = 'pawstructions.pendingRole';

export type ProfileRole = 'owner' | 'sitter';

export async function setPendingRole(role: ProfileRole): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, role);
  } catch {
    // A role we cannot remember costs the user one tap in Settings later. It
    // must never block an account from being created.
  }
}

/** Reads and clears in one go: this is consumed exactly once. */
export async function takePendingRole(): Promise<ProfileRole | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    if (value) await AsyncStorage.removeItem(KEY);
    return value === 'owner' || value === 'sitter' ? value : null;
  } catch {
    return null;
  }
}
