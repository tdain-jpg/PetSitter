import { useCallback, useEffect, useState } from 'react';
import { dataService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { takePendingRole, type ProfileRole } from '../lib/pendingRole';

/**
 * The signed-in user's landing preference, applying any choice made at sign-up.
 *
 * Two jobs, in one place because they are the same fact arriving by two routes.
 *
 * 1. CLAIM. Email confirmation is on, so the role chosen during sign-up could
 *    not be written then — there was no session. The first authenticated load
 *    after that claims it. It is written only when the profile has NO role yet,
 *    so a stale intent left on a shared device can never overwrite the settled
 *    preference of whoever signs in next.
 *
 * 2. READ. Everything downstream — which home to open, whether Settings shows
 *    the sitter card — asks this hook rather than re-querying.
 *
 * `resolved` is the important flag. Null means "no preference, use the owner
 * default", and it is indistinguishable from "not loaded yet" if you only look
 * at `role`. Routing on the unresolved state would send a sitter to the founder
 * wizard because a query had not come back, which is the same class of bug the
 * household routing already guards against by waiting for a clean read.
 */
export function useProfileRole() {
  const { isAuthenticated } = useAuth();
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [resolved, setResolved] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setRole(null);
      setResolved(false);
      return;
    }
    try {
      let current = await dataService.getMyRole();

      if (current === null) {
        // Device first (fast, and set the moment they chose), then the account
        // metadata, which is the copy that survives signing up on a laptop and
        // confirming the email on a phone. Without the second one, a sitter who
        // changed device between those two steps silently became an owner and
        // landed in the pet-owner wizard.
        const claimed = (await takePendingRole()) ?? (await dataService.getSignupRole());
        if (claimed) {
          await dataService.setMyRole(claimed);
          current = claimed;
        }
      }

      setRole(current);
    } catch {
      // Treat an unreadable role as no preference: the owner dashboard is the
      // historical default and the safe one, and Settings can always change it.
      setRole(null);
    } finally {
      setResolved(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = useCallback(async (next: ProfileRole) => {
    await dataService.setMyRole(next);
    setRole(next);
  }, []);

  return { role, resolved, isSitter: role === 'sitter', choose, reload: load };
}
