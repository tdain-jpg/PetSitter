import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, ScreenContainer } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { useGuideWithPets } from '../hooks';
import { dataService } from '../services';
import { buildGeneratedTasks } from '../lib/routineTasks';
import { formatDate } from '../lib/dates';
import { COLORS } from '../constants';
import type { TaskCompletion } from '../types';
import type { VisitHistoryScreenProps } from '../navigation/types';

/**
 * What has actually been done for this guide, day by day.
 *
 * The daily routine shows one day and only the current state of it. Nothing in
 * the app has ever shown the record across days, even though every tick has
 * been stored with its time and its author since 0026. For an owner that record
 * is the answer to "has anyone been in since Tuesday" without having to ask.
 * For a sitter it is evidence of work done, which is the half of this that
 * matters when somebody disputes it.
 *
 * NO MIGRATION. The plan called for adding completed_by_user_id, on the belief
 * that completed_by held a display name. It does not — 0026 pins it to
 * auth.uid()::text and says so, choosing an id over a name precisely so that
 * later renames could not rewrite history. The premise was mine and it was
 * wrong; the column it asked for already exists under a different name. Sitters
 * also already have SELECT on task_completions, so the RPC the plan wanted
 * would have wrapped a query that RLS already answers correctly.
 *
 * ATTRIBUTION stays "you" / "your sitter" / "the owner", matching the routine
 * screen. Resolving an id to a name means reading auth.users for somebody else,
 * which RLS rightly refuses, and freezing a display string into the row would
 * undo the reason 0026 stored an id.
 */

interface DayGroup {
  date: string;
  entries: { completion: TaskCompletion; title: string }[];
}

export function VisitHistoryScreen({ navigation, route }: VisitHistoryScreenProps) {
  const { guideId } = route.params;
  const { user } = useAuth();
  const { guide, pets, loading: guideLoading, canEdit } = useGuideWithPets(guideId);
  const [history, setHistory] = useState<TaskCompletion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const rows = await dataService.getCompletionHistory(guideId);
          if (!cancelled) {
            setHistory(rows);
            setFailed(false);
          }
        } catch {
          if (!cancelled) {
            setHistory([]);
            setFailed(true);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [guideId])
  );

  /**
   * task_id → the words a human recognises.
   *
   * Completions store only the id, so the titles are rebuilt from the same
   * derivation the checklist uses. A task that has since been deleted, or a
   * pet removed from the guide, will not resolve — those rows keep their raw id
   * rather than disappearing, because a completed task that vanishes from the
   * record is exactly the thing this screen exists to prevent.
   */
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    if (!guide) return map;
    for (const task of buildGeneratedTasks(guide.id, pets)) map.set(task.id, task.title);
    for (const task of guide.daily_routine?.tasks ?? []) map.set(task.id, task.title);
    return map;
  }, [guide, pets]);

  const days: DayGroup[] = useMemo(() => {
    if (!history) return [];
    const byDate = new Map<string, DayGroup>();
    for (const completion of history) {
      const group = byDate.get(completion.date) ?? { date: completion.date, entries: [] };
      group.entries.push({
        completion,
        title: titles.get(completion.task_id) ?? completion.task_id,
      });
      byDate.set(completion.date, group);
    }
    for (const group of byDate.values()) {
      group.entries.sort((a, b) =>
        (a.completion.completed_at ?? '').localeCompare(b.completion.completed_at ?? '')
      );
    }
    // Newest day first: the question is almost always about the recent past.
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [history, titles]);

  const who = (completion: TaskCompletion): string | null => {
    const id = completion.completed_by;
    if (!id) return null; // predates 0026 — say nothing rather than guess
    if (id === user?.id) return 'you';
    return canEdit ? 'your sitter' : 'the owner';
  };

  const time = (completion: TaskCompletion): string => {
    if (!completion.completed_at) return '';
    const d = new Date(completion.completed_at);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const loading = guideLoading || history === null;

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Visit history</Text>
            <Text className="text-tan-500">{guide?.title ?? 'What has been done, and when'}</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color={COLORS.secondary} />
            </View>
          ) : failed ? (
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                Could not load the history
              </Text>
              <Text className="text-brown-700 leading-6">
                This is a connection problem, not an empty record. Go back and open it again.
              </Text>
            </Card>
          ) : days.length === 0 ? (
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-1">Nothing ticked yet</Text>
              <Text className="text-brown-700 leading-6">
                As tasks on the daily checklist are ticked off, each one is recorded here with
                the time it was done and who did it.
              </Text>
            </Card>
          ) : (
            days.map((day) => (
              <View key={day.date} className="mb-5">
                <Text className="text-lg font-semibold text-brown-800 mb-2">
                  {formatDate(day.date)}
                </Text>
                <Card>
                  {day.entries.map(({ completion, title }, index) => {
                    const label = who(completion);
                    return (
                      <View
                        key={completion.id ?? `${completion.task_id}-${index}`}
                        className={`flex-row items-start ${
                          index > 0 ? 'mt-3 pt-3 border-t border-tan-200' : ''
                        }`}
                      >
                        <Text className="mr-2">✅</Text>
                        <View className="flex-1">
                          <Text className="text-brown-800">{title}</Text>
                          <Text className="text-tan-500 text-sm">
                            {[time(completion), label ? `by ${label}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))
          )}
          <View className="mb-8" />
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
