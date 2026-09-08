import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { showConfirm } from '../lib/dialogs';
import type { Pet } from '../types';

/**
 * "Copy from another pet" for the parts of a pet that are usually the same.
 *
 * Most households use one vet for every animal, and often one feeding routine.
 * Typing the same clinic name, phone, address and emergency number four times
 * is the kind of tedium that makes people stop halfway and leave a guide with a
 * vet on one pet and nothing on the others, which is exactly the gap a sitter
 * discovers at the worst moment.
 *
 * Only offers pets that ACTUALLY HAVE the section filled in. A menu listing
 * every pet and then copying nothing is worse than no menu, and it makes the
 * user do the remembering the app should be doing.
 *
 * Confirms before overwriting, and only then. Copying into an empty section is
 * what the button is for and should cost one tap; copying over something the
 * user typed is a different act and gets a question.
 *
 * DELIBERATELY NOT OFFERED FOR MEDICATIONS. Doses are per-animal and depend on
 * weight; a copied dose is a plausible-looking wrong number on a checklist
 * somebody follows while giving an actual drug to an actual animal. The tedium
 * argument does not survive contact with that.
 */

interface CopyFromPetProps {
  /** Every other pet available to copy from. The current pet is filtered out by the caller. */
  pets: Pet[];
  /** What is being copied, lower case, e.g. "vet details". */
  what: string;
  /** True when this pet already has something in that section. */
  hasExisting: boolean;
  /** Whether a candidate has anything worth copying. */
  hasValue: (pet: Pet) => boolean;
  /** One line describing what would come across, e.g. "Happy Paws Clinic". */
  describe: (pet: Pet) => string;
  onCopy: (pet: Pet) => void;
}

export function CopyFromPet({
  pets,
  what,
  hasExisting,
  hasValue,
  describe,
  onCopy,
}: CopyFromPetProps) {
  const [open, setOpen] = useState(false);
  const candidates = pets.filter(hasValue);

  if (candidates.length === 0) return null;

  const choose = async (pet: Pet) => {
    if (hasExisting) {
      const ok = await showConfirm({
        title: `Replace these ${what}?`,
        message: `This will overwrite what is here now with ${pet.name}'s ${what}.`,
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }
    onCopy(pet);
    setOpen(false);
  };

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={`Copy ${what} from another pet`}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text className="text-primary-600 font-medium">
          {open ? 'Cancel' : `📋 Copy ${what} from another pet`}
        </Text>
      </Pressable>

      {open ? (
        <View className="mt-2 border border-tan-200 rounded-lg bg-cream-50">
          {candidates.map((pet, index) => (
            <Pressable
              key={pet.id}
              onPress={() => void choose(pet)}
              accessibilityRole="button"
              accessibilityLabel={`Copy from ${pet.name}. ${describe(pet)}`}
              style={{ minHeight: 44, justifyContent: 'center' }}
              className={`px-4 py-3 ${index > 0 ? 'border-t border-tan-200' : ''}`}
            >
              <Text className="text-brown-800 font-medium">{pet.name}</Text>
              {/* The preview is the point: it turns "copy from Clark" from a
                  guess into a decision. */}
              <Text className="text-tan-500 text-sm" numberOfLines={1}>
                {describe(pet)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
