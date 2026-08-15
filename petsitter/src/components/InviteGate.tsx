import { View, Text } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import type { PendingInvite } from '../types';

interface InviteGateProps {
  /** The invite on offer (the first pending one when several are waiting). */
  invite: PendingInvite;
  /** How many MORE invites are waiting beyond the one shown. */
  extraCount: number;
  /** True while the accept flow runs — shows the spinner, disables both actions. */
  accepting: boolean;
  onAccept: () => void;
  onStartFresh: () => void;
}

/**
 * Invite-aware first run (contract C5): rendered INSIDE HomeScreen — no
 * navigation route — when settings say onboarding isn't complete but a
 * household invite is waiting. Without this gate a brand-new invitee was
 * replaced straight into the founder pet-wizard and never saw their invite.
 *
 * Presentational on purpose. DataContext.respondToInvite owns the join
 * itself (RPC, refreshes, and the first-run onboarding tail); HomeScreen only
 * holds this gate open across that window, since the refreshes empty
 * pendingInvites before settings catch up.
 */
export function InviteGate({
  invite,
  extraCount,
  accepting,
  onAccept,
  onStartFresh,
}: InviteGateProps) {
  return (
    <Card className="mb-4 bg-primary-50 border-primary-200">
      <View className="items-center py-6 px-2">
        <Text className="text-5xl mb-3">💌</Text>
        <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
          {"You're invited!"}
        </Text>
        <Text className="text-brown-600 text-center mb-1 font-semibold">
          {invite.household_name}
        </Text>
        {invite.invited_by_email ? (
          <Text className="text-tan-500 text-center mb-3">
            {`Invited by ${invite.invited_by_email}`}
          </Text>
        ) : (
          <View className="mb-3" />
        )}
        <Text className="text-brown-600 text-center mb-4">
          {"Accept to see the household's pets and guides — or start your own space."}
        </Text>
        {extraCount > 0 && (
          <Text className="text-tan-500 text-center mb-4">
            {`+${extraCount} more invitation${extraCount === 1 ? '' : 's'} waiting`}
          </Text>
        )}
        <View className="w-full gap-3">
          <Button
            title="Accept & Join"
            onPress={onAccept}
            loading={accepting}
            disabled={accepting}
          />
          <Button
            title="Start fresh instead"
            variant="outline"
            onPress={onStartFresh}
            disabled={accepting}
          />
        </View>
      </View>
    </Card>
  );
}
