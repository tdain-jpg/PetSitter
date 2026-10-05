import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from './Card';
import { Button } from './Button';
import { useData } from '../contexts';
import { dataService } from '../services';
import { showAlert, showConfirm } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { COLORS } from '../constants';
import type { Guide, SitterInviteRow } from '../types';

/**
 * "Pet sitter for this trip", on the owner's view of a guide.
 *
 * A sitter connection covers the whole household, open-ended, so until 0034
 * there was no way to ask "will you take THIS trip", and nowhere for a sitter
 * to see what they had agreed to. Here the owner picks one of the household's
 * sitters; the sitter is emailed, answers in the app, and the owner sees the
 * answer here (and by email).
 *
 * Status is read from the guide, and kept locally after a change until the
 * refreshed guide arrives, so the card answers the tap immediately.
 */
const STATUS_TEXT: Record<string, string> = {
  requested: 'Asked. Waiting for their answer.',
  accepted: 'Accepted. They are covering this trip.',
  declined: "Declined. They can't take this one.",
};

export function TripSitterCard({ guide }: { guide: Guide }) {
  const navigation = useNavigation<any>();
  const { refreshGuides } = useData();
  // Every connection row, live or not, so the card can tell "removed" (a
  // revoked row) from "couldn't read it" (no row at all). Pickable sitters are
  // the live ones.
  const [allRows, setAllRows] = useState<SitterInviteRow[] | null>(null);
  const sitters = allRows?.filter((r) => r.status === 'invited' || r.status === 'active') ?? null;
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ id: string | null; status: string | null } | null>(null);

  const connectionId = local ? local.id : guide.sitter_connection_id ?? null;
  const status = local ? local.status : guide.sitter_status ?? null;

  useEffect(() => {
    // The refreshed guide has caught up with what we set; drop the override.
    if (local && guide.sitter_connection_id === local.id && (guide.sitter_status ?? null) === local.status) {
      setLocal(null);
    }
  }, [guide.sitter_connection_id, guide.sitter_status, local]);

  const load = useCallback(async () => {
    if (!guide.household_id) return;
    try {
      setAllRows(await dataService.getSitterConnections(guide.household_id));
    } catch {
      setAllRows([]);
    }
  }, [guide.household_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const assigned = sitters?.find((s) => s.id === connectionId) ?? null;
  const removed = !assigned && !!allRows?.some((r) => r.id === connectionId);

  const choose = async (row: SitterInviteRow) => {
    setBusy(true);
    try {
      await dataService.setTripSitter(guide.id, row.id);
      setLocal({ id: row.id, status: 'requested' });
      setPicking(false);
      void refreshGuides();
      showAlert(
        'Request sent',
        row.status === 'invited'
          ? `We're emailing ${row.email}. Once they accept your sitter invitation, this trip will be waiting for them to accept.`
          : `We're emailing ${row.email}. You'll see their answer here, and we'll email you too.`
      );
    } catch (error: any) {
      showAlert("Couldn't ask that sitter", friendlyError(error?.message, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    const ok = await showConfirm({
      title: 'Remove the sitter from this trip?',
      message: 'The trip will no longer show on their list. They keep access to your household until you remove them under Pet Sitters.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await dataService.setTripSitter(guide.id, null);
      setLocal({ id: null, status: null });
      void refreshGuides();
    } catch (error: any) {
      showAlert("Couldn't remove the sitter", friendlyError(error?.message, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <Text className="text-lg font-semibold text-brown-800 mb-1">🐾 Pet sitter for this trip</Text>

      {sitters === null ? (
        <View className="py-3">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : connectionId && !picking ? (
        <>
          <Text className="text-brown-800 font-medium">
            {assigned?.email ?? (removed ? 'A sitter no longer connected' : 'Your sitter')}
          </Text>
          <Text
            className={`text-sm mb-3 ${status === 'accepted' ? 'text-primary-700' : 'text-tan-600'}`}
          >
            {assigned
              ? STATUS_TEXT[status ?? 'requested']
              : removed
                ? 'They were removed from your household, so this trip needs a new sitter.'
                : "We couldn't load their details just now. Try again in a moment."}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button title="Choose someone else" onPress={() => setPicking(true)} variant="outline" disabled={busy} />
            <Button title="Remove" onPress={clear} variant="outline" disabled={busy} />
          </View>
        </>
      ) : sitters.length === 0 ? (
        <>
          <Text className="text-tan-600 mb-3">
            Invite your sitter first. They'll get an email, and then you can ask them to cover this trip.
          </Text>
          <Button title="Invite a sitter" onPress={() => navigation.navigate('Sitters')} variant="outline" />
        </>
      ) : (
        <>
          <Text className="text-tan-600 mb-3">
            Ask one of your sitters to cover this trip. They'll get an email and can accept in the app.
          </Text>
          {sitters.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => choose(s)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Ask ${s.email} to cover this trip`}
              style={{ minHeight: 48, opacity: busy ? 0.6 : 1 }}
              className="border border-primary-300 rounded-lg px-3 py-2 mb-2 justify-center"
            >
              <Text className="text-primary-700 font-medium">{s.email}</Text>
              {s.status === 'invited' ? (
                <Text className="text-tan-500 text-xs">Hasn't accepted your sitter invitation yet</Text>
              ) : null}
            </Pressable>
          ))}
          {picking ? (
            <Button title="Cancel" onPress={() => setPicking(false)} variant="outline" disabled={busy} />
          ) : null}
        </>
      )}
    </Card>
  );
}
