import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import { formatDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'CheatSheets'>;

/**
 * A front door for cheat sheets.
 *
 * They were two taps inside a guide, which meant the feature people pay Crown
 * for was the hardest thing in the app to find — Tim couldn't locate it in his
 * own product. This lists every guide and says, for each, whether a sheet
 * exists, so the answer to "where are my cheat sheets" is a Quick Action rather
 * than a memory test.
 *
 * Guides without a sheet are listed too, and say so. A list that hid them would
 * answer "where are my cheat sheets" but not the more common "why doesn't this
 * guide have one".
 */
export function CheatSheetsScreen({ navigation }: Props) {
  const { guides, loadingGuides, getCheatSheetIndex } = useData();
  const [sheetDates, setSheetDates] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getCheatSheetIndex();
        if (cancelled) return;
        setSheetDates(new Map(rows.map((r) => [r.guide_id, r.generated_at])));
      } catch (err: any) {
        if (cancelled) return;
        showAlert('Error', friendlyError(err, "Couldn't load your cheat sheets."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getCheatSheetIndex]);

  if (loading || loadingGuides) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Cheat Sheets" />
      {/* ScrollView OUTSIDE ScreenContainer: the container caps content width,
          the scroller owns the height. Nesting them the other way gives a
          width-capped scroller inside an unscrollable page. */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="content">
          {guides.length === 0 ? (
            <Card>
              <View className="items-center py-8">
                <Text className="text-5xl mb-4">🤖</Text>
                <Text className="text-xl font-semibold text-brown-800 mb-2">No guides yet</Text>
                <Text className="text-tan-500 text-center mb-4">
                  A cheat sheet is a one-page summary of a guide, so you&apos;ll need a
                  guide first.
                </Text>
                <Button title="View Guides" onPress={() => navigation.navigate('Guides')} />
              </View>
            </Card>
          ) : (
            <>
              <Text className="text-tan-500 mb-4">
                A one-page summary of a guide, written for whoever is looking after your
                pets.
              </Text>
              {guides.map((guide) => {
                const generatedAt = sheetDates.get(guide.id);
                const written = generatedAt
                  ? `Written ${formatDate(generatedAt.slice(0, 10), { dateStyle: 'medium' })}`
                  : 'No cheat sheet yet — tap to write one';
                return (
                  <Card key={guide.id} className="mb-3">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${guide.title}. ${written}`}
                      style={{ minHeight: 44, justifyContent: 'center' }}
                      onPress={() =>
                        (navigation as any).navigate('AICheatSheet', { guideId: guide.id })
                      }
                    >
                      <Text className="text-lg font-semibold text-brown-800">
                        {guide.title}
                      </Text>
                      <Text
                        className={generatedAt ? 'text-tan-500 text-sm' : 'text-tan-400 text-sm'}
                      >
                        {written}
                      </Text>
                    </Pressable>
                  </Card>
                );
              })}
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
