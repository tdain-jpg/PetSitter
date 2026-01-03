import { View, Text, Image, Pressable, Platform } from 'react-native';
import type { Pet } from '../types';

interface PetCardProps {
  pet: Pet;
  onPress: () => void;
}

const speciesEmoji: Record<string, string> = {
  dog: '🐕',
  cat: '🐱',
  bird: '🐦',
  fish: '🐟',
  reptile: '🦎',
  rabbit: '🐰',
  hamster: '🐹',
  other: '🐾',
};

export function PetCard({ pet, onPress }: PetCardProps) {
  const emoji = speciesEmoji[pet.species] || '🐾';

  // Web-specific rendering for better click handling
  if (Platform.OS === 'web') {
    return (
      <div
        onClick={onPress}
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #f3f4f6',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          transition: 'transform 0.1s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.01)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {pet.photo_url ? (
          <img
            src={pet.photo_url}
            alt={pet.name}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            {emoji}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#111827',
              }}
            >
              {pet.name}
            </span>
            {pet.status === 'deceased' && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280',
                  borderRadius: 12,
                }}
              >
                Memorial
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: 14,
              color: '#6b7280',
              textTransform: 'capitalize',
            }}
          >
            {pet.breed || pet.species}
          </span>
          {pet.age && (
            <span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 8 }}>
              • {pet.age} {pet.age === 1 ? 'year' : 'years'} old
            </span>
          )}
        </div>

        <span style={{ fontSize: 20, color: '#9ca3af' }}>›</span>
      </div>
    );
  }

  // Native rendering
  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100 flex-row items-center"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {pet.photo_url ? (
        <Image
          source={{ uri: pet.photo_url }}
          className="w-16 h-16 rounded-full"
          resizeMode="cover"
        />
      ) : (
        <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center">
          <Text className="text-3xl">{emoji}</Text>
        </View>
      )}

      <View className="flex-1 ml-4">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-semibold text-gray-900">{pet.name}</Text>
          {pet.status === 'deceased' && (
            <View className="bg-gray-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-gray-500">Memorial</Text>
            </View>
          )}
        </View>
        <Text className="text-gray-500 capitalize">
          {pet.breed || pet.species}
          {pet.age && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
        </Text>
      </View>

      <Text className="text-2xl text-gray-300">›</Text>
    </Pressable>
  );
}
