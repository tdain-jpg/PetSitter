import { useState } from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { useData } from '../contexts';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import type { Guide } from '../types';

/**
 * "Lillee is not on this guide."
 *
 * A guide holds an explicit list of pet ids, and adding a pet to the household
 * does not add it to guides that already exist. That is the right default: a
 * trip can legitimately cover some of your animals and not others, and silently
 * folding a new pet into every existing guide would put a dog on a guide that
 * was written for the cat going to the cattery.
 *
 * But the silence was the problem. Add a pet, regenerate the cheat sheet, and
 * the sheet still describes one animal with nothing anywhere explaining why.
 * The AI looks broken, the guide looks broken, and the actual cause — a pet
 * that was never added to this guide — is invisible on every screen involved.
 *
 * So: say it, and make it one tap to fix. Never fix it automatically.
 *
 * Owners only. A sitter cannot edit a guide, and telling them a pet is missing
 * from a document they cannot change is an alarm with no button on it.
 */
export function MissingPetsNotice({
  guide,
  canEdit,
  onAdded,
}: {
  guide: Guide;
  canEdit: boolean;
  /** Called after the guide changes, so the caller can refresh what it shows. */
  onAdded?: () => void;
}) {
  const { activePets, updateGuide } = useData();
  const [busy, setBusy] = useState(false);

  if (!canEdit) return null;

  const onGuide = new Set(guide.pet_ids ?? []);
  // Only pets of THIS guide's household. activePets spans every household the
  // user belongs to, and offering to add next door's cat would be nonsense.
  const missing = activePets.filter(
    (pet) => pet.household_id === guide.household_id && !onGuide.has(pet.id)
  );

  if (missing.length === 0) return null;

  const names = missing.map((p) => p.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  const addAll = async () => {
    setBusy(true);
    try {
      await updateGuide(guide.id, {
        pet_ids: [...(guide.pet_ids ?? []), ...missing.map((p) => p.id)],
      });
      onAdded?.();
      showAlert(
        'Added',
        names.length === 1
          ? `${list} is now on this guide. Regenerate the cheat sheet to include them.`
          : `${list} are now on this guide. Regenerate the cheat sheet to include them.`
      );
    } catch (error: any) {
      showAlert('Could not add', friendlyError(error, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 bg-warm-50 border border-warm-300">
      <Text className="text-base font-semibold text-brown-800 mb-1">
        {names.length === 1 ? `${list} is not on this guide` : `${list} are not on this guide`}
      </Text>
      <Text className="text-brown-700 leading-6 mb-4">
        {names.length === 1
          ? 'They live in this household but were not added to this trip, so nothing here covers them, including the cheat sheet.'
          : 'They live in this household but were not added to this trip, so nothing here covers them, including the cheat sheet.'}
      </Text>
      <Button
        title={busy ? 'Adding…' : names.length === 1 ? `Add ${list}` : 'Add them'}
        onPress={addAll}
        disabled={busy}
      />
      <Text className="text-tan-500 text-sm mt-3">
        Leave it if this trip really is only for the pets already listed.
      </Text>
    </Card>
  );
}
