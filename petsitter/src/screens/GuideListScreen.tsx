import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, GuideCard } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Guides'>;

export function GuideListScreen({ navigation }: Props) {
  const { guides, activePets, loadingGuides } = useData();

  const handleAddGuide = () => {
    (navigation as any).navigate('GuideForm', { mode: 'create' });
  };

  const handleGuidePress = (guideId: string) => {
    (navigation as any).navigate('GuideDetail', { guideId });
  };

  if (loadingGuides) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <Pressable
          onPress={() => navigation.navigate('Home')}
          className="mb-3"
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text className="text-tan-500 text-sm">← Back to Home</Text>
        </Pressable>
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-brown-800">My Guides</Text>
            <Text className="text-tan-500">
              {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
            </Text>
          </View>
          <Button
            title="+ New Guide"
            onPress={handleAddGuide}
            variant="primary"
          />
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {guides.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Text className="text-6xl mb-4">📋</Text>
            <Text className="text-xl font-semibold text-brown-800 mb-2">
              No guides yet
            </Text>
            <Text className="text-tan-500 text-center mb-6">
              Create your first pet sitter guide to share care instructions.
            </Text>
            <Button
              title="Create Your First Guide"
              onPress={handleAddGuide}
              variant="primary"
            />
          </View>
        ) : (
          guides.map((guide) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              pets={activePets}
              onPress={() => handleGuidePress(guide.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
