import { View, Text } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import type { PendingSitterInvite } from '../types';

interface SitterInviteGateProps {
  /** The invitation on offer (the first pending one when several are waiting). */
  invite: PendingSitterInvite;
  /** How many MORE invitations are waiting beyond the one shown. */
  extraCount: number;
  /** True while accept or decline runs — shows the spinner, disables both actions. */
  responding: boolean;
  /** Which action is running, so only that button shows the spinner. */
  respondingAccept: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * First run for a SITTER: rendered inside HomeScreen — no navigation route —
 * when settings say onboarding isn't complete but a sitter invitation is
 * waiting. Mirrors InviteGate, which does the same job for a household invite.
 * Without it a newly-signed-up sitter was replaced straight into the founder
 * pet-wizard and asked to add their first pet; they have none, and the
 * households they came for were reachable only from Settings.
 *
 * Presentational on purpose: HomeScreen owns the accept flow (RPC, the
 * first-run onboarding tail, and the hand-off to SitterHome).
 */
export function SitterInviteGate({
  invite,
  extraCount,
  responding,
  respondingAccept,
  onAccept,
  onDecline,
}: SitterInviteGateProps) {
  return (
    <Card className="mb-4 bg-primary-50 border-primary-200">
      <View className="items-center py-6 px-2">
        <Text className="text-5xl mb-3">🐾</Text>
        <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
          {"You've been asked to pet sit"}
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
          {'Accept to see this household’s pets and care guides, tick off tasks as you go, and leave check-ins for the owner. You don’t need pets of your own.'}
        </Text>
        {extraCount > 0 && (
          <Text className="text-tan-500 text-center mb-4">
            {`+${extraCount} more invitation${extraCount === 1 ? '' : 's'} waiting`}
          </Text>
        )}
        <View className="w-full gap-3">
          <Button
            title="Accept & Get Started"
            onPress={onAccept}
            loading={responding && respondingAccept}
            disabled={responding}
          />
          <Button
            title="Decline"
            variant="outline"
            onPress={onDecline}
            loading={responding && !respondingAccept}
            disabled={responding}
          />
        </View>
      </View>
    </Card>
  );
}
