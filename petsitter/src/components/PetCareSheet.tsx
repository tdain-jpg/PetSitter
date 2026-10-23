import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { Button } from './Button';
import { ScheduleEditor } from './ScheduleEditor';
import { MedicationEditor } from './MedicationEditor';
import { useData } from '../contexts';
import { generateId } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import type { FeedingSchedule, Medication, Pet } from '../types';

/**
 * One pet's feeding schedule or medications, edited on their own.
 *
 * Both lived only inside Edit Pet, two thirds of the way down a long form, and
 * feedback (2026-10-23) asked for "a section to add medications to". They were
 * there; nobody could find them. The routine had the same gap from the other
 * side: its feeding and medication tasks are generated from these two lists, so
 * they had no Edit button, and changing a feeding time meant knowing to go back
 * to the pet.
 *
 * This sheet is opened from both places, Pet Detail and the Daily Routine, and
 * writes the same two fields Edit Pet does, so the routine follows on its own.
 *
 * `startWithNew` opens with one blank entry, for "+ Add medication": a sheet
 * that opens empty and makes you find a second Add button is the problem this
 * exists to fix.
 */
export type PetCareKind = 'feeding' | 'medications';

interface PetCareSheetProps {
  pet: Pet | null;
  kind: PetCareKind;
  visible: boolean;
  startWithNew?: boolean;
  onClose: () => void;
}

const blankMedication = (): Medication => ({
  id: generateId(),
  name: '',
  dosage: '',
  frequency: 'Once daily',
  times: [''],
});

const blankFeeding = (): FeedingSchedule => ({
  id: generateId(),
  time: '08:00',
  food_type: '',
  amount: '',
});

export function PetCareSheet({ pet, kind, visible, startWithNew, onClose }: PetCareSheetProps) {
  const { updatePet } = useData();
  const [feedings, setFeedings] = useState<FeedingSchedule[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [saving, setSaving] = useState(false);

  // A fresh copy each time it opens, so Cancel really discards. Keyed on the
  // pet's id, not the object: a background refresh hands over a new Pet object
  // and must not wipe what is being typed.
  useEffect(() => {
    if (!visible || !pet) return;
    const feeds = pet.feeding_schedule ?? [];
    const meds = pet.medications ?? [];
    setFeedings(startWithNew && kind === 'feeding' ? [...feeds, blankFeeding()] : feeds);
    setMedications(startWithNew && kind === 'medications' ? [...meds, blankMedication()] : meds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pet?.id, kind, startWithNew]);

  if (!pet) return null;

  const save = async () => {
    setSaving(true);
    try {
      // An untouched blank row is dropped rather than saved: it would become
      // "Give Biscuit medication: :" on the sitter's checklist.
      const updates =
        kind === 'feeding'
          ? { feeding_schedule: feedings.filter((f) => f.time?.trim() || f.food_type.trim() || f.amount.trim()) }
          : { medications: medications.filter((m) => m.name.trim()) };
      await updatePet(pet.id, updates);
      onClose();
    } catch (error) {
      showAlert("Couldn't save", friendlyError(error, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const title = kind === 'feeding' ? `${pet.name}'s feeding` : `${pet.name}'s medications`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-cream-50 rounded-t-3xl p-6 max-h-[85%] w-full self-center" style={{ maxWidth: 520 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-xl font-bold text-brown-800 flex-1">{title}</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
              >
                <Text className="text-2xl text-tan-400">✕</Text>
              </Pressable>
            </View>
            <Text className="text-tan-600 mb-4">
              Changes here update {pet.name}&apos;s profile and every daily routine {pet.name} is on.
            </Text>

            {kind === 'feeding' ? (
              <ScheduleEditor schedules={feedings} onChange={setFeedings} />
            ) : (
              <MedicationEditor medications={medications} onChange={setMedications} />
            )}

            <View className="gap-3 mt-6">
              <Button title={saving ? 'Saving…' : 'Save'} onPress={save} variant="primary" disabled={saving} />
              <Button title="Cancel" onPress={onClose} variant="outline" disabled={saving} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
