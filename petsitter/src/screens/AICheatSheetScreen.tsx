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
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, CheatSheet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'AICheatSheet'>;

export function AICheatSheetScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, activePets, deceasedPets, settings, getCheatSheet, saveCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
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
    // Resolve the guide and its pets from live context state at generate time —
    // the mount-time snapshot in local state goes stale if the guide or pets
    // are edited while this screen sits in the navigation stack.
    const liveGuide = guides.find((g) => g.id === guideId);
    if (!liveGuide) return;
    const livePets = [...activePets, ...deceasedPets].filter((p) =>
      liveGuide.pet_ids.includes(p.id)
    );

    if (!settings?.gemini_api_key) {
      const message = 'Please add your Gemini API key in Settings first.';
      if (Platform.OS === 'web') {
        window.alert(message);
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
        liveGuide,
        livePets,
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
      showAlert('Generation Failed', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!cheatSheet) return;

    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(cheatSheet.content);
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(cheatSheet.content);
      }
      showAlert('Copied', 'Cheat sheet copied to clipboard!');
    } catch (err) {
      showAlert('Error', 'Failed to copy to clipboard');
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
          <Text key={index} className="text-base font-semibold text-brown-800 mt-4 mb-2">
            {line.replace('### ', '')}
          </Text>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <Text key={index} className="text-lg font-bold text-brown-800 mt-4 mb-2">
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
          <Text key={index} className="text-brown-600 ml-4 mb-1">
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
        <Text key={index} className="text-brown-600 mb-1">
          {line.replace(/\*\*(.*?)\*\*/g, '$1')}
        </Text>
      );
    });
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <View className="flex-row items-center justify-between">
          <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          {cheatSheet && (
            <Button title="📋 Copy" onPress={handleCopyToClipboard} variant="secondary" />
          )}
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-brown-800">🤖 AI Cheat Sheet</Text>
          <Text className="text-tan-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {!cheatSheet ? (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">🤖</Text>
            <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
              Generate AI Cheat Sheet
            </Text>
            <Text className="text-tan-500 text-center mb-6">
              Use AI to create a quick reference summary of this guide for your pet sitter.
            </Text>

            {error && (
              <Text className="text-accent-500 mb-4 text-center">{error}</Text>
            )}

            <Button
              title={generating ? 'Generating...' : '✨ Generate Cheat Sheet'}
              onPress={handleGenerate}
              loading={generating}
              disabled={generating}
            />

            <Text className="text-tan-500 text-sm mt-4 text-center">
              Guide contents are sent to Google Gemini to create the summary.
            </Text>
          </Card>
        ) : (
          <>
            <Card className="mb-4">
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <Text className="text-lg font-semibold text-brown-800">
                    Generated Cheat Sheet
                  </Text>
                  <Text className="text-tan-400 text-sm">
                    Generated {new Date(cheatSheet.generated_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              <View className="border-t border-tan-200 pt-4">
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
              <Text className="text-tan-500 text-sm text-center">
                Guide contents are sent to Google Gemini to create the summary.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
