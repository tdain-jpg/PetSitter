import { View, Text, Image, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { displayablePhotoUrl } from '../lib/petPhotos';
import { Icon, speciesIconName } from './Icon';
import type { Pet } from '../types';

/**
 * Every living pet in the household, as a face you can tap.
 *
 * People love seeing their animals, and a photo is a far faster target than a
 * word: an owner scanning for Clark finds Clark's face before they finish
 * reading a list. It sits in the header beside Settings so it is on the first
 * screen, above everything, on every visit.
 *
 * WHY IT IS NOT IN THE HEADER, which is where it was first asked for and
 * first built. Inline beside the logo forced the header to scroll sideways on a
 * phone, and testing found the obvious problem with that: a shortcut you have
 * to discover by swiping is not a shortcut. At the top of the page it is simply
 * there, and big enough to recognise a dog by.
 *
 * IT GOES TO THE EDIT FORM, not the detail screen. That is the deliberate
 * choice: this is a maintenance shortcut for the person who OWNS the pet and
 * keeps its feeding times and medications current, and the detail screen is
 * already one tap from the list below. (Say so if the detail view would be
 * better — it is a one-line change.)
 *
 * IT WRAPS RATHER THAN SCROLLING. With the full page width available there is
 * room for four or five faces per row on a phone, so a household of six wraps
 * onto a second line instead of hiding half of itself off the edge.
 *
 * LIVING PETS ONLY. A memorial pet appearing in a row of quick actions, to be
 * tapped by mistake on the way to Settings, is not a small thing to get wrong.
 */
export function PetQuickLinks({ pets }: { pets: Pet[] }) {
  const navigation = useNavigation<any>();
  const living = pets.filter((pet) => pet.status !== 'deceased');

  if (living.length === 0) return null;

  return (
    <View className="flex-row flex-wrap mb-4" style={{ gap: 12 }}>
      {living.map((pet) => {
        const photoUrl = displayablePhotoUrl(pet.photo_url);
        return (
          <Pressable
            key={pet.id}
            onPress={() => navigation.navigate('PetForm', { mode: 'edit', petId: pet.id })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${pet.name}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 72 })}
            className="items-center"
          >
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                className="w-16 h-16 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-16 h-16 rounded-full bg-tan-100 items-center justify-center">
                <Icon name={speciesIconName(pet.species)} size={40} />
              </View>
            )}
            {/* One line, clipped. A long name must not widen the header, which
                is the mistake the greeting beside it already had to fix. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontSize: 12.5, marginTop: 5, maxWidth: 72, textAlign: 'center' }}
              className="text-brown-700"
            >
              {pet.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
