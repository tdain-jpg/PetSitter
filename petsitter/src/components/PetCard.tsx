import { View, Text, Image, Pressable } from 'react-native';
import { displayablePhotoUrl } from '../lib/petPhotos';
import { Icon, speciesIconName } from './Icon';
import type { Pet } from '../types';

interface PetCardProps {
  pet: Pet;
  onPress: () => void;
}

export function PetCard({ pet, onPress }: PetCardProps) {
  const photoUrl = displayablePhotoUrl(pet.photo_url);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${pet.name}, ${pet.breed || pet.species}`}
      className="bg-cream-50 rounded-xl p-4 mb-3 shadow-sm border border-tan-200 flex-row items-center"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
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

      <View className="flex-1 ml-4">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-semibold text-brown-800">{pet.name}</Text>
          {pet.status === 'deceased' && (
            <View className="bg-tan-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-tan-500">Memorial</Text>
            </View>
          )}
        </View>
        <Text className="text-tan-500 capitalize">
          {pet.breed || pet.species}
          {pet.age != null && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
        </Text>
      </View>

      <Text className="text-2xl text-tan-300">›</Text>
    </Pressable>
  );
}
