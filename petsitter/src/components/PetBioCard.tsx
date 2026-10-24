import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Button } from './Button';
import { useData } from '../contexts';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { COLORS } from '../constants';
import type { Pet } from '../types';

/**
 * A short, shareable bio of a pet (0047), written with AI from what the
 * profile already says and edited by the owner before saving.
 *
 * Open to every owner since 2026-10-21, after testing on Clark and Lillee.
 * Sitters see a saved bio but do not write them. generate-pet-bio allows
 * 10 bios per account per day.
 */
type Tone = 'warm' | 'funny' | 'pet_voice';
const TONES: { key: Tone; label: string }[] = [
  { key: 'warm', label: 'Heartfelt' },
  { key: 'funny', label: 'Funny' },
  { key: 'pet_voice', label: 'In their own words' },
];

async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') {
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PetBioCard({ pet, canEdit }: { pet: Pet; canEdit: boolean }) {
  const { updatePet } = useData();
  const canWrite = canEdit;
  const [tone, setTone] = useState<Tone>('warm');
  const [draft, setDraft] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = pet.bio?.trim() || '';
  if (!saved && !canWrite) return null;

  const write = async () => {
    setWriting(true);
    try {
      setDraft(await dataService.generatePetBio(pet.id, tone));
    } catch (error) {
      showAlert("Couldn't write a bio", friendlyError(error, 'Please try again.'));
    } finally {
      setWriting(false);
    }
  };

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await updatePet(pet.id, { bio: draft.trim() || null, bio_updated_at: new Date().toISOString() });
      setDraft(null);
    } catch (error) {
      showAlert("Couldn't save the bio", friendlyError(error, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    const ok = await copyText(text);
    showAlert(ok ? 'Copied' : "Couldn't copy", ok ? `${pet.name}'s bio is ready to paste.` : 'Select the text and copy it instead.');
  };

  const pill = (active: boolean) =>
    `px-3 rounded-full border ${active ? 'bg-primary-500 border-primary-500' : 'border-primary-300 bg-cream-50'}`;

  return (
    <View className="bg-cream-50 rounded-xl border border-tan-200 p-4 mb-4">
      <Text className="text-lg font-semibold text-brown-800 mb-2">✨ {pet.name}&apos;s bio</Text>

      {draft !== null ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            accessibilityLabel={`${pet.name}'s bio`}
            style={{ minHeight: 140, textAlignVertical: 'top' }}
            className="border border-tan-200 rounded-lg p-3 text-brown-800 bg-white leading-6"
          />
          <Text className="text-tan-500 text-xs mt-1 mb-3">Edit anything you like before saving.</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button title={saving ? 'Saving…' : 'Save bio'} onPress={save} disabled={saving} />
            <Button title="Try again" onPress={write} variant="outline" disabled={writing || saving} />
            <Button title="Cancel" onPress={() => setDraft(null)} variant="outline" disabled={saving} />
          </View>
        </>
      ) : saved ? (
        <>
          <Text className="text-brown-700 leading-6 mb-3" selectable>
            {saved}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button title="Copy" onPress={() => copy(saved)} variant="outline" />
            {canWrite ? <Button title="Edit" onPress={() => setDraft(saved)} variant="outline" /> : null}
          </View>
        </>
      ) : (
        <Text className="text-tan-600 mb-3">
          A short bio of {pet.name} to share with friends, written from their profile. Nothing medical
          and nothing about you is included.
        </Text>
      )}

      {canWrite && draft === null ? (
        <View className="mt-4">
          <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
            {TONES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTone(t.key)}
                accessibilityRole="button"
                accessibilityLabel={`${t.label} tone`}
                accessibilityState={{ selected: tone === t.key }}
                aria-selected={tone === t.key}
                style={{ minHeight: 40, justifyContent: 'center' }}
                className={pill(tone === t.key)}
              >
                <Text className={tone === t.key ? 'text-white font-semibold' : 'text-primary-700'}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          {writing ? (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <ActivityIndicator color={COLORS.primary} />
              <Text className="text-tan-600">Writing {pet.name}&apos;s bio…</Text>
            </View>
          ) : (
            <Button title={saved ? '✨ Write a new one' : '✨ Write a bio'} onPress={write} />
          )}
        </View>
      ) : null}
    </View>
  );
}
