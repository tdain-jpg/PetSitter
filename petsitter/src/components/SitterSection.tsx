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
      await inviteSitter(householdId, trimmedEmail);
      setEmail('');
      // Reload sitters after successful invite
      const data = await getSitterConnections(householdId);
      setSitters(data.filter(s => s.status === 'invited' || s.status === 'active'));
      // No delivery claim: unlike the household path, invite_sitter sends no
      // email at all — the invitation exists only in the app. Telling the owner
      // it was "sent" is how a sitter never learns to go looking for it.
      //
      // The second paragraph is the cheapest answer to a real gap QA found in
      // the sitter journey: a sitter has no way to reach the OWNER. The
      // emergency contact and the vet both have tap-to-call; the person who
      // owns the animal appears nowhere. So a pet that stops eating on day
      // three leaves the sitter with a check-in note or the neighbour.
      //
      // Rather than put the owner's phone number in front of a sitter — a
      // privacy decision that is Tim's, not this component's — this asks the
      // owner to add THEMSELVES as an emergency contact. They choose which
      // number to give, it costs no schema, and it lands in a list the sitter
      // already reads and can already dial. Said here because this is the one
      // moment the owner is thinking about that sitter.
      showAlert(
        'Invitation created',
        `${trimmedEmail} will see the invitation on their home screen when they sign in. We don't email sitter invites yet, so let them know it's waiting.\n\n` +
          'One more thing worth doing: add yourself as an emergency contact on the guides you share. Your sitter can reach the vet and your neighbour from inside the app, but not you.'
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
