import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { friendlyError } from '../lib/errors';
// Imported from the individual modules rather than the barrel: this file lives
// in components/, and going through ./index would close an import cycle.
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { useData } from '../contexts';
import { isValidEmail } from '../utils';
import type { SitterInviteRow } from '../types';

interface SitterSectionProps {
  householdId: string;
  isOwner: boolean;
}

export function SitterSection({ householdId, isOwner }: SitterSectionProps) {
  const [sitters, setSitters] = useState<SitterInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  // What the owner wants THIS sitter to reach them on. Per-connection by
  // design (migration 0025): a dog walker used twice a year and a
  // sister-in-law with a key are not owed the same access.
  const [ownerContact, setOwnerContact] = useState('');
  const [sending, setSending] = useState(false);
  
  const { inviteSitter, getSitterConnections, revokeSitter } = useData();

  useEffect(() => {
    if (!isOwner) return;
    
    const loadSitters = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSitterConnections(householdId);
        setSitters(data.filter(s => s.status === 'invited' || s.status === 'active'));
      } catch (err) {
        setError('Failed to load sitters. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadSitters();
  }, [householdId, isOwner]);

  const handleInvite = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('Enter an email address', 'Please enter a valid email to invite a sitter.');
      return;
    }
    // See HouseholdScreen.handleInvite: the server accepts anything with an @
    // in it, which is enough to create an invitation nobody can ever accept.
    if (!isValidEmail(trimmedEmail)) {
      showAlert('Enter an email address', `"${trimmedEmail}" doesn't look like an email address.`);
      return;
    }

    try {
      setSending(true);
      await inviteSitter(householdId, trimmedEmail, ownerContact.trim() || undefined);
      setEmail('');
      setOwnerContact('');
      // Reload sitters after successful invite
      const data = await getSitterConnections(householdId);
      setSitters(data.filter(s => s.status === 'invited' || s.status === 'active'));
      // invite_sitter now queues a branded email (0034): sitter sign-up with
      // their address filled in, or sign-in if they already have an account.
      // The queue drains every 15 minutes, so the copy promises the email
      // without promising it is already in their inbox, and still says where
      // the invitation waits.
      showAlert(
        'Invitation sent',
        `We're emailing ${trimmedEmail} an invitation to create a free sitter account (or sign in). It should arrive within 15 minutes, and it will be waiting on their home screen when they sign in.\n\n` +
          'Next: open a guide and choose them under "Pet sitter for this trip" to ask them to cover it.'
      );
    } catch (err: any) {
      showAlert('Could not invite', friendlyError((err as Error)?.message, 'Something went wrong. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Remove sitter?',
      message: 'They will lose access to this household\'s pets and guides immediately.',
      confirmLabel: 'Remove',
      destructive: true
    });

    if (!confirmed) return;

    try {
      await revokeSitter(id);
      // Reload sitters after successful revoke
      const data = await getSitterConnections(householdId);
      setSitters(data.filter(s => s.status === 'invited' || s.status === 'active'));
    } catch (err: any) {
      showAlert('Could not remove', friendlyError(err, 'An unknown error occurred.'));
    }
  };

  if (!isOwner) return null;

  const hasSitters = sitters.length > 0;

  return (
    <Card className="mt-4">
      <View className="mb-3">
        <View className="flex-row items-center justify-between">
          <h2 className="text-lg font-semibold">Pet sitters</h2>
        </View>
        <p className="text-sm text-gray-600 mt-1">
          Sitters can view this household's pets and guides and tick off tasks, but cannot make changes.
        </p>
      </View>

      {error ? (
        <View className="py-4">
          <p className="text-center text-red-600 mb-2">{error}</p>
          <Button
            title="Try again"
            onPress={() => {
              setError(null);
              setLoading(true);
              getSitterConnections(householdId).then(data => {
                setSitters(data.filter(s => s.status === 'invited' || s.status === 'active'));
                setLoading(false);
              }).catch(err => {
                setError('Failed to load sitters. Please try again.');
                setLoading(false);
              });
            }}
          />
        </View>
      ) : loading ? (
        <p className="text-center py-4">Loading...</p>
      ) : hasSitters ? (
        <View className="space-y-2">
          {sitters.map(sitter => (
            <View key={sitter.id} className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg">
              <View>
                <Text className="font-medium">{sitter.email}</Text>
                <View className="flex-row items-center mt-1">
                  {sitter.status === 'active' ? (
                    <>
                      <Text className="text-sm text-green-600">Has access</Text>
                      {sitter.ends_on && (
                        <Text className="text-xs text-gray-500 ml-2">Until {formatDate(sitter.ends_on)}</Text>
                      )}
                    </>
                  ) : (
                    <Text className="text-sm text-blue-600">Invitation sent</Text>
                  )}
                </View>
              </View>
              <Button
                title="Remove"
                variant="danger"
                onPress={() => handleRevoke(sitter.id)}
              />
            </View>
          ))}
        </View>
      ) : (
        <p className="text-center py-4 text-gray-500">No sitters connected yet.</p>
      )}

      <View className="mt-4">
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="Enter email address"
          autoCapitalize="none"
          keyboardType="email-address"
          label="Invite a sitter"
        />
        {/* The answer to the gap QA found in the sitter journey: the emergency
            contact and the vet both have tap-to-call, and the person who owns
            the animal appeared nowhere. Optional on purpose — an owner who
            would rather not share a number can still invite a sitter, and the
            helper text says what leaving it blank means. */}
        <Input
          value={ownerContact}
          onChangeText={setOwnerContact}
          placeholder="e.g. 555-0100 (cell, after 6pm)"
          keyboardType="phone-pad"
          label="How this sitter can reach you (optional)"
        />
        <Text className="text-tan-500 text-sm -mt-2 mb-3">
          Shown only to this sitter, only while they are connected. Leave it
          blank and they will reach you through check-ins instead.
        </Text>
        <View className="mt-2">
          <Button
            title="Send invitation"
            onPress={handleInvite}
            loading={sending}
            disabled={sending}
          />
        </View>
      </View>
    </Card>
  );
}
