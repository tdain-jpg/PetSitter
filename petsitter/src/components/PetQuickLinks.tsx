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
 * IT GOES TO THE EDIT FORM, not the detail screen. That is the deliberate
 * choice: this is a maintenance shortcut for the person who OWNS the pet and
 * keeps its feeding times and medications current, and the detail screen is
 * already one tap from the list below. (Say so if the detail view would be
 * better — it is a one-line change.)
 *
 * A PLAIN ROW, not a scroller. The header itself scrolls horizontally, so
 * nesting a second scroller here would fight it: two overlapping scroll
 * regions on the same axis, where a swipe starting on a pet moves one and a
 * swipe starting on the logo moves the other. The header owns the axis.
 *
 * LIVING PETS ONLY. A memorial pet appearing in a row of quick actions, to be
 * tapped by mistake on the way to Settings, is not a small thing to get wrong.
 */
export function PetQuickLinks({ pets }: { pets: Pet[] }) {
  const navigation = useNavigation<any>();
  const living = pets.filter((pet) => pet.status !== 'deceased');

  if (living.length === 0) return null;

  return (
    <View className="flex-row items-center" style={{ gap: 12, marginLeft: 12 }}>
      {living.map((pet) => {
        const photoUrl = displayablePhotoUrl(pet.photo_url);
        return (
          <Pressable
            key={pet.id}
            onPress={() => navigation.navigate('PetForm', { mode: 'edit', petId: pet.id })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${pet.name}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 56 })}
            className="items-center"
          >
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                className="w-11 h-11 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-11 h-11 rounded-full bg-tan-100 items-center justify-center">
                <Icon name={speciesIconName(pet.species)} size={28} />
              </View>
            )}
            {/* One line, clipped. A long name must not widen the header, which
                is the mistake the greeting beside it already had to fix. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontSize: 11, marginTop: 3, maxWidth: 56, textAlign: 'center' }}
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
