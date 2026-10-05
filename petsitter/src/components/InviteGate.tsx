import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
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
  /** Declined for now: set up their own space, as an owner or as a sitter. */
  onStartFresh: (role: 'owner' | 'sitter') => void;
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
  // "Start fresh" is the one place an invitee is asked what brings them here.
  // Someone who came to join a family does not need the question; someone
  // turning the invitation down does, because they might be a sitter.
  const [choosing, setChoosing] = useState(false);

  if (choosing) {
    return (
      <Card className="mb-4">
        <View className="py-4 px-2">
          <Text className="text-xl font-semibold text-brown-800 mb-1 text-center">
            What brings you here?
          </Text>
          <Text className="text-tan-500 text-center mb-4">
            Your invitation to {invite.household_name} stays waiting if you change your mind.
          </Text>
          <View className="gap-3">
            {([
              { key: 'owner' as const, title: 'My own pets', sub: 'Build guides for sitters' },
              { key: 'sitter' as const, title: 'I sit for others', sub: 'Look after clients\u2019 pets' },
            ]).map((o) => (
              <Pressable
                key={o.key}
                onPress={() => onStartFresh(o.key)}
                accessibilityRole="button"
                accessibilityLabel={`${o.title}. ${o.sub}`}
                style={{ minHeight: 56 }}
                className="rounded-xl border-2 border-primary-300 bg-cream-50 px-4 py-3 justify-center"
              >
                <Text className="font-semibold text-brown-800">{o.title}</Text>
                <Text className="text-tan-500 text-sm">{o.sub}</Text>
              </Pressable>
            ))}
            <Button title="Back to the invitation" variant="outline" onPress={() => setChoosing(false)} />
          </View>
        </View>
      </Card>
    );
  }

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
        {invite.invited_by_name || invite.invited_by_email ? (
          <Text className="text-tan-500 text-center mb-3">
            {`Invited by ${invite.invited_by_name || invite.invited_by_email}`}
          </Text>
        ) : (
          <View className="mb-3" />
        )}
        <Text className="text-brown-600 text-center mb-4">
          {"Accept to see the household's pets and guides, or start your own space."}
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
            onPress={() => setChoosing(true)}
            disabled={accepting}
          />
        </View>
      </View>
    </Card>
  );
}
