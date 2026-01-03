import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, GuideCard } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainTabParamList, 'Guides'>;

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
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-900">My Guides</Text>
            <Text className="text-gray-500">
              {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
            </Text>
          </View>
          {Platform.OS === 'web' ? (
            <button
              onClick={handleAddGuide}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Guide
            </button>
          ) : (
            <Button
              title="+ New Guide"
              onPress={handleAddGuide}
              variant="primary"
            />
          )}
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {guides.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Text className="text-6xl mb-4">📋</Text>
            <Text className="text-xl font-semibold text-gray-900 mb-2">
              No guides yet
            </Text>
            <Text className="text-gray-500 text-center mb-6">
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
