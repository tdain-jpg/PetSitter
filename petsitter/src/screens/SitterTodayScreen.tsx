import { useCallback, useState } from 'react';
import { safeGoBack } from '../lib/goBack';
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { toLocalDateKey } from '../lib/dates';
import { formatTaskTime } from '../lib/routineTasks';
import { COLORS } from '../constants';
import type { SitterTodayGroup, SitterTodayRow } from '../types';
import type { SitterTodayScreenProps } from '../navigation/types';

/**
 * Everything due today, across every client, in one list.
 *
 * The per-guide checklist answers "what does this household need". A sitter
 * with four clients had to open four guides to answer the question they
 * actually have, which is "what is next". This is that question.
 *
 * GROUPED BY TIME BLOCK, NOT BY HOUSEHOLD. Standing in somebody's kitchen at
 * 7am, the sitter needs the morning — all of it, from every house — not a
 * directory of houses. The household name rides on every row instead, because
 * without it "Feed Juno" is ambiguous the moment two clients own a Juno.
 *
 * Ticking here writes the same completion row the per-guide screen writes,
 * through the same adapter call, so the two views cannot disagree about what
 * has been done. `completed_by` is not sent from either: migration 0026 pins it
 * server-side from auth.uid(), and the person with the most reason to misreport
 * who fed the dog is the person who was supposed to.
 */
export function SitterTodayScreen({ navigation }: SitterTodayScreenProps) {
  const { markTaskComplete, markTaskIncomplete } = useData();
  const [groups, setGroups] = useState<SitterTodayGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const today = toLocalDateKey(new Date());

  const load = useCallback(async () => {
    try {
      setGroups(await dataService.getSitterToday(today));
      setFailed(false);
    } catch {
      // A failed read must not render as "nothing to do today". That reads as
      // a finished day, and a sitter who believes it does not feed anybody.
      setGroups(null);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (row: SitterTodayRow) => {
    const key = `${row.guideId}:${row.task.id}`;
    setBusy(key);
    try {
      if (row.completed) {
        await markTaskIncomplete(row.guideId, row.task.id, today);
      } else {
        await markTaskComplete({
          task_id: row.task.id,
          guide_id: row.guideId,
          date: today,
          completed_at: new Date().toISOString(),
        });
      }
      // Flip locally rather than refetching: a refetch here costs a read per
      // client household, and the answer is already known.
      setGroups((prev) =>
        prev?.map((group) => ({
          ...group,
          rows: group.rows.map((r) =>
            r.guideId === row.guideId && r.task.id === row.task.id
              ? { ...r, completed: !r.completed }
              : r
          ),
        })) ?? prev
      );
    } catch (error: any) {
      showAlert('Could not update', friendlyError(error, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const total = groups?.reduce((n, g) => n + g.rows.length, 0) ?? 0;
  const done = groups?.reduce((n, g) => n + g.rows.filter((r) => r.completed).length, 0) ?? 0;
  const allDone = total > 0 && done === total;

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => safeGoBack(navigation)} variant="outline" />
            <Button
              title="My Clients"
              onPress={() => navigation.navigate('SitterHome')}
              variant="outline"
            />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Today</Text>
            <Text className="text-tan-500">
              {loading
                ? 'Across all your clients'
                : total === 0
                  ? 'Across all your clients'
                  : `${done} of ${total} done`}
            </Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView
        className="flex-1 p-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={COLORS.secondary}
          />
        }
      >
        <ScreenContainer variant="content">
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color={COLORS.secondary} />
            </View>
          ) : failed ? (
            /* Distinct from "nothing due": silence here would be a lie with
               consequences. */
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                Could not load today
              </Text>
              <Text className="text-brown-700 leading-6 mb-4">
                Your list is not showing because the app could not reach the server. It is not
                that there is nothing to do — pull down to try again.
              </Text>
              <Button title="Try again" onPress={() => void load()} />
            </Card>
          ) : total === 0 ? (
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                Nothing scheduled today
              </Text>
              <Text className="text-brown-700 leading-6">
                None of your clients have a guide covering today. When an owner sets trip dates
                that include today, their routine appears here automatically.
              </Text>
            </Card>
          ) : (
            <>
              {allDone ? (
                <Card className="mb-4 bg-primary-50 border border-primary-200">
                  <Text className="text-lg font-semibold text-brown-800">
                    🎉 Everything is done
                  </Text>
                  <Text className="text-brown-700 leading-6">
                    All {total} tasks across your clients are ticked off. Nice work.
                  </Text>
                </Card>
              ) : null}

              {groups?.map((group) => (
                <View key={group.block} className="mb-5">
                  <Text className="text-lg font-semibold text-brown-800 mb-2">
                    {group.icon} {group.label}
                  </Text>
                  {group.rows.map((row) => {
                    const key = `${row.guideId}:${row.task.id}`;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => void toggle(row)}
                        disabled={busy === key}
                        accessibilityRole="checkbox"
                        aria-checked={row.completed}
                        accessibilityState={{ checked: row.completed }}
                        accessibilityLabel={`${row.task.title}, for ${row.householdName}${
                          row.completed ? ', done' : ''
                        }`}
                        style={{ minHeight: 44, opacity: busy === key ? 0.5 : 1 }}
                        className="bg-cream-50 border border-tan-200 rounded-xl px-4 py-3 mb-2 flex-row items-center"
                      >
                        <Text className="text-xl mr-3">{row.completed ? '✅' : '⬜'}</Text>
                        <View className="flex-1">
                          <Text
                            className={
                              row.completed
                                ? 'text-tan-500 line-through'
                                : 'text-brown-800 font-semibold'
                            }
                          >
                            {row.task.title}
                          </Text>
                          {/* The household is the disambiguator, so it is never
                              truncated away — two clients can own a Juno. */}
                          <Text className="text-primary-600 text-sm">{row.householdName}</Text>
                          {row.task.description ? (
                            <Text className="text-tan-500 text-sm">{row.task.description}</Text>
                          ) : null}
                        </View>
                        {row.task.time ? (
                          <Text className="text-tan-500 text-sm ml-2">{formatTaskTime(row.task.time)}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          )}

          <View className="mb-8" />
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
