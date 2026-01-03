import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import { generateCheatSheet } from '../services/AIService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, Pet, CheatSheet } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'AICheatSheet'>;

export function AICheatSheetScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, activePets, deceasedPets, settings, getCheatSheet, saveCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [cheatSheet, setCheatSheet] = useState<CheatSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [guideId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
        const allPets = [...activePets, ...deceasedPets];
        setGuidePets(allPets.filter((p) => foundGuide.pet_ids.includes(p.id)));
      }

      const existingSheet = await getCheatSheet(guideId);
      setCheatSheet(existingSheet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!guide) return;

    if (!settings?.gemini_api_key) {
      const message = 'Please add your Gemini API key in Settings first.';
      if (Platform.OS === 'web') {
        alert(message);
        (navigation as any).navigate('Settings');
      } else {
        Alert.alert('API Key Required', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => (navigation as any).navigate('Settings') },
        ]);
      }
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const content = await generateCheatSheet(
        guide,
        guidePets,
        settings.gemini_api_key
      );

      const newSheet = await saveCheatSheet({
        guide_id: guideId,
        content,
        generated_at: new Date().toISOString(),
        model_used: 'gemini-1.5-flash',
      });

      setCheatSheet(newSheet);
    } catch (err: any) {
      setError(err.message);
      if (Platform.OS === 'web') {
        alert(err.message);
      } else {
        Alert.alert('Generation Failed', err.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!cheatSheet) return;

    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(cheatSheet.content);
        alert('Copied to clipboard!');
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(cheatSheet.content);
        Alert.alert('Copied', 'Cheat sheet copied to clipboard!');
      }
    } catch (err) {
      const message = 'Failed to copy to clipboard';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  };

  // Simple markdown-to-text renderer for display
  const renderMarkdown = (content: string) => {
    // Split by lines and render with basic formatting
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <Text key={index} className="text-base font-semibold text-gray-900 mt-4 mb-2">
            {line.replace('### ', '')}
          </Text>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <Text key={index} className="text-lg font-bold text-gray-900 mt-4 mb-2">
            {line.replace('## ', '')}
          </Text>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <Text key={index} className="text-xl font-bold text-primary-600 mt-4 mb-3">
            {line.replace('# ', '')}
          </Text>
        );
      }

      // Bullet points
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <Text key={index} className="text-gray-700 ml-4 mb-1">
            • {line.replace(/^[-*] /, '').replace(/\*\*(.*?)\*\*/g, '$1')}
          </Text>
        );
      }

      // Empty lines
      if (line.trim() === '') {
        return <View key={index} className="h-2" />;
      }

      // Regular text (remove bold markers for display)
      return (
        <Text key={index} className="text-gray-700 mb-1">
          {line.replace(/\*\*(.*?)\*\*/g, '$1')}
        </Text>
      );
    });
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-xl text-gray-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#2563eb',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          )}
          {cheatSheet && (
            Platform.OS === 'web' ? (
              <button
                onClick={handleCopyToClipboard}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                📋 Copy
              </button>
            ) : (
              <Button title="📋 Copy" onPress={handleCopyToClipboard} variant="secondary" />
            )
          )}
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-gray-900">🤖 AI Cheat Sheet</Text>
          <Text className="text-gray-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {!cheatSheet ? (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">🤖</Text>
            <Text className="text-xl font-semibold text-gray-900 mb-2 text-center">
              Generate AI Cheat Sheet
            </Text>
            <Text className="text-gray-500 text-center mb-6">
              Use AI to create a quick reference summary of this guide for your pet sitter.
            </Text>

            {error && (
              <Text className="text-red-500 mb-4 text-center">{error}</Text>
            )}

            <Button
              title={generating ? 'Generating...' : '✨ Generate Cheat Sheet'}
              onPress={handleGenerate}
              loading={generating}
              disabled={generating}
            />

            <Text className="text-gray-400 text-sm mt-4 text-center">
              Powered by Google Gemini
            </Text>
          </Card>
        ) : (
          <>
            <Card className="mb-4">
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text className="text-lg font-semibold text-gray-900">
                    Generated Cheat Sheet
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    Generated {new Date(cheatSheet.generated_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              <View className="border-t border-gray-100 pt-4">
                {renderMarkdown(cheatSheet.content)}
              </View>
            </Card>

            <View className="gap-3 mb-8">
              <Button
                title="🔄 Regenerate"
                onPress={handleGenerate}
                loading={generating}
                disabled={generating}
                variant="outline"
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
