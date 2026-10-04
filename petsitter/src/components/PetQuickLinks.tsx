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
 * IT GOES TO THE PET'S PAGE. It first went straight to the edit form, which
 * QA caught: the pet cards then lower on Home opened the pet's page, so the
 * same dog led two places from one screen.
 *
 * IT IS THE ONLY WAY TO THE PETS ON HOME. A "Manage pets" pill closes the row
 * and opens the full list (adding a pet lives there). It replaced a Manage
 * Pets button and a "Your Pets" list that both led to the same animals; three
 * routes to one place became one. The pill grows to fill whatever the faces
 * leave on their line, and when there is no room left it wraps onto a line of
 * its own at full width, so it never needs a size worked out per household.
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
            // The pet's page, same as the pet cards lower on Home. Two taps
            // on the same pet landing in two different places read as a bug.
            onPress={() => navigation.navigate('PetDetail', { petId: pet.id })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${pet.name}`}
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
      <Pressable
        onPress={() => navigation.navigate('Pets')}
        accessibilityRole="button"
        accessibilityLabel="Manage pets: add, edit, or see every pet"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexGrow: 1, minWidth: 150 })}
        className="h-16 rounded-full border-2 border-primary-500 items-center justify-center px-5"
      >
        <Text className="text-primary-600 font-semibold" style={{ fontSize: 16 }}>
          Manage pets
        </Text>
        <Text className="text-tan-500" style={{ fontSize: 12 }} numberOfLines={1}>
          Add a pet, edit details
        </Text>
      </Pressable>
    </View>
  );
}
