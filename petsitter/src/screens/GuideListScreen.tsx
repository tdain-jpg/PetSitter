import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, GuideCard, ScreenHeader } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Guides'>;

export function GuideListScreen({ navigation }: Props) {
  // Resolve guide pets against ALL pets (active + memorial) so cards match
  // GuideDetail — guides can still reference pets moved to the memorial.
  const { guides, pets, loadingGuides } = useData();

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

      <ScreenHeader
        title="My Guides"
        backLabel="← Home"
        onBack={() => navigation.navigate('Home')}
        showHome={false}
      />

      <View className="flex-row justify-between items-center px-4 pt-4">
        <Text className="text-tan-500">
          {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
        </Text>
        <Button
          title="+ New Guide"
          onPress={handleAddGuide}
          variant="primary"
        />
      </View>

      <ScrollView className="flex-1 p-4">
        {guides.length === 0 ? (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">📋</Text>
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
          </Card>
        ) : (
          guides.map((guide) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              pets={pets}
              onPress={() => handleGuidePress(guide.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
