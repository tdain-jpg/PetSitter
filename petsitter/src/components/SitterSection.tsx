import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
// Imported from the individual modules rather than the barrel: this file lives
// in components/, and going through ./index would close an import cycle.
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { useData } from '../contexts';
import type { SitterInviteRow } from '../types';

interface SitterSectionProps {
  householdId: string;
  isOwner: boolean;
}

/**
 * The RPCs raise bare lowercase strings ('invalid email'). Map the known ones,
 * sentence-case anything unexpected. Mirrors friendlyRpcError in
 * HouseholdScreen — the two invite paths now raise the SAME text for the same
 * conditions (0019), so one vocabulary covers both.
 */
function friendlySitterError(raw: unknown, fallback: string): string {
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message) return fallback;
  switch (message.toLowerCase()) {
    case 'invalid email':
      return "That doesn't look like an email address.";
    case 'that person is already in this household':
      return 'That person is already in your household, so they can already see everything a sitter could.';
    case 'that email already has a live connection to this household':
      return 'That person is already connected as a sitter here.';
    case 'not authorized':
      return 'Only the household owner can invite sitters.';
    default: {
      const sentence = message.charAt(0).toUpperCase() + message.slice(1);
      return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    }
  }
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
      showAlert(
        'Invitation created',
        `${trimmedEmail} will see the invitation on their home screen when they sign in. We don't email sitter invites yet, so let them know it's waiting.`
      );
    } catch (err: any) {
      showAlert('Could not invite', friendlySitterError((err as Error)?.message, 'Something went wrong. Please try again.'));
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
      showAlert('Could not remove', err.message || 'An unknown error occurred.');
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
