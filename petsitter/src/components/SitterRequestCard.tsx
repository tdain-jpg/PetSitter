import { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button } from './Button';
import { Card } from './Card';
import { dataService } from '../services';
import { showAlert, showConfirm } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import type { PendingOwnerInvite } from '../types';

/**
 * "Your sitter would like to connect" — the owner's half of a sitter-sent
 * invitation.
 *
 * WHY IT IS PROMINENT AND WHY IT IS NOT A GATE. This is somebody asking for
 * read-only access to your pets, your home information and your door codes, so
 * it belongs above the fold rather than buried in Settings. But it is NOT a
 * blocking gate like the household-invite flow: an owner who ignores it should
 * be able to keep using their app, and a request from a sitter they have never
 * heard of should be easy to walk past. Declining is one tap and needs no
 * confirmation; accepting asks, because accepting is the consequential half.
 *
 * Renders nothing when there is no request, which is almost always.
 */
export function SitterRequestCard() {
  const navigation = useNavigation<any>();
  const [invites, setInvites] = useState<PendingOwnerInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await dataService.getMyPendingOwnerInvites());
    } catch {
      // A request we cannot read is one the owner simply is not shown. It stays
      // pending server-side and appears next time; nothing is lost or granted.
      setInvites([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const respond = async (invite: PendingOwnerInvite, accept: boolean) => {
    if (accept) {
      const ok = await showConfirm({
        title: `Give ${invite.sitter_name} access?`,
        message:
          'They will be able to read your pets, guides and home information, including any codes you have saved. They cannot change anything, and you can take this back at any time.',
        confirmLabel: 'Give access',
      });
      if (!ok) return;
    }
    setBusy(invite.id);
    try {
      await dataService.respondToOwnerInvite(invite.id, accept);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (accept) {
        showAlert(
          'Connected',
          `${invite.sitter_name} can now see your pets and guides. Manage this any time under Pet Sitters.`
        );
      }
    } catch (error: any) {
      showAlert('Could not respond', friendlyError(error, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <>
      {invites.map((invite) => (
        <Card key={invite.id} className="mb-4 bg-warm-50 border border-warm-300">
          <Text className="text-lg font-semibold text-brown-800 mb-1">
            {invite.sitter_name} would like to connect
          </Text>
          <Text className="text-brown-700 leading-6 mb-4">
            They use Pawstructions to keep track of the pets they look after. Accepting gives
            them read-only access to your pets and guides. Nothing is shared until you do.
          </Text>
          <Button
            title={busy === invite.id ? 'Working…' : 'Give access'}
            onPress={() => void respond(invite, true)}
            disabled={busy !== null}
          />
          <View className="h-3" />
          <Button
            title="No thanks"
            onPress={() => void respond(invite, false)}
            variant="outline"
            disabled={busy !== null}
          />
          <Text className="text-tan-500 text-sm mt-3">
            Not expecting this? Declining tells them nothing about your account.
          </Text>
        </Card>
      ))}
    </>
  );
}
