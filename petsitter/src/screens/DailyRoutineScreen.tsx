import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, Pet, RoutineTask, TaskCompletion, TimeBlock } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'DailyRoutine'>;

const TIME_BLOCKS: { id: TimeBlock; label: string; icon: string }[] = [
  { id: 'morning', label: 'Morning', icon: '🌅' },
  { id: 'midday', label: 'Midday', icon: '☀️' },
  { id: 'evening', label: 'Evening', icon: '🌆' },
  { id: 'bedtime', label: 'Bedtime', icon: '🌙' },
];

export function DailyRoutineScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const {
    guides,
    activePets,
    deceasedPets,
    getTaskCompletions,
    markTaskComplete,
    markTaskIncomplete,
  } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);

  useEffect(() => {
    loadData();
  }, [guideId]);

  useEffect(() => {
    if (guide) {
      loadCompletions();
    }
  }, [selectedDate, guide]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
        const allPets = [...activePets, ...deceasedPets];
        setGuidePets(allPets.filter((p) => foundGuide.pet_ids.includes(p.id)));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCompletions = async () => {
    const data = await getTaskCompletions(guideId, selectedDate);
    setCompletions(data);
  };

  // Generate tasks from pet schedules
  const generatedTasks = useMemo(() => {
    const tasks: RoutineTask[] = [];
    let order = 0;

    guidePets.forEach((pet) => {
      // Feeding tasks
      pet.feeding_schedule.forEach((feeding) => {
        const hour = parseInt(feeding.time.split(':')[0], 10);
        let timeBlock: TimeBlock = 'morning';
        if (hour >= 11 && hour < 15) timeBlock = 'midday';
        else if (hour >= 15 && hour < 20) timeBlock = 'evening';
        else if (hour >= 20 || hour < 6) timeBlock = 'bedtime';

        tasks.push({
          id: `feeding-${pet.id}-${feeding.id}`,
          pet_id: pet.id,
          time_block: timeBlock,
          time: feeding.time,
          title: `Feed ${pet.name}`,
          description: `${feeding.amount} of ${feeding.food_type}${feeding.notes ? ` - ${feeding.notes}` : ''}`,
          is_recurring: true,
          category: 'feeding',
          order: order++,
        });
      });

      // Medication tasks
      pet.medications.forEach((med) => {
        let timeBlock: TimeBlock = 'morning';
        if (med.time) {
          const hour = parseInt(med.time.split(':')[0], 10);
          if (hour >= 11 && hour < 15) timeBlock = 'midday';
          else if (hour >= 15 && hour < 20) timeBlock = 'evening';
          else if (hour >= 20 || hour < 6) timeBlock = 'bedtime';
        }

        tasks.push({
          id: `med-${pet.id}-${med.id}`,
          pet_id: pet.id,
          time_block: timeBlock,
          time: med.time,
          title: `Give ${pet.name} medication`,
          description: `${med.name}: ${med.dosage}${med.with_food ? ' (with food)' : ''}${med.notes ? ` - ${med.notes}` : ''}`,
          is_recurring: true,
          category: 'medication',
          order: order++,
        });
      });
    });

    // Add general tasks
    if (guidePets.some((p) => p.species === 'dog')) {
      tasks.push({
        id: 'walk-morning',
        time_block: 'morning',
        title: 'Morning walk',
        is_recurring: true,
        category: 'walk',
        order: order++,
      });
      tasks.push({
        id: 'walk-evening',
        time_block: 'evening',
        title: 'Evening walk',
        is_recurring: true,
        category: 'walk',
        order: order++,
      });
    }

    if (guidePets.some((p) => p.species === 'cat')) {
      tasks.push({
        id: 'litter-morning',
        time_block: 'morning',
        title: 'Clean litter box',
        is_recurring: true,
        category: 'litter',
        order: order++,
      });
    }

    // Water refresh
    tasks.push({
      id: 'water-morning',
      time_block: 'morning',
      title: 'Refresh water bowls',
      is_recurring: true,
      category: 'water',
      order: order++,
    });

    return tasks;
  }, [guidePets]);

  const isTaskCompleted = (taskId: string) => {
    return completions.some((c) => c.task_id === taskId);
  };

  const handleToggleTask = async (task: RoutineTask) => {
    const isCompleted = isTaskCompleted(task.id);

    if (isCompleted) {
      await markTaskIncomplete(task.id, selectedDate);
      setCompletions((prev) => prev.filter((c) => c.task_id !== task.id));
    } else {
      const completion = await markTaskComplete({
        task_id: task.id,
        guide_id: guideId,
        date: selectedDate,
        completed_at: new Date().toISOString(),
      });
      setCompletions((prev) => [...prev, completion]);
    }
  };

  const changeDate = (offset: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dateStr === today) return 'Today';
    if (dateStr === tomorrow) return 'Tomorrow';
    if (dateStr === yesterday) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const completedCount = generatedTasks.filter((t) => isTaskCompleted(t.id)).length;
  const totalCount = generatedTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
      <View className="bg-white border-b border-gray-100">
        <View className="flex-row items-center px-4 pt-12 pb-2">
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
        </View>

        {/* Date Navigator */}
        <View className="flex-row items-center justify-between px-4 py-3">
          {Platform.OS === 'web' ? (
            <>
              <button
                onClick={() => changeDate(-1)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ←
              </button>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                {formatDate(selectedDate)}
              </span>
              <button
                onClick={() => changeDate(1)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                →
              </button>
            </>
          ) : (
            <>
              <Pressable onPress={() => changeDate(-1)} className="bg-gray-100 px-4 py-2 rounded-lg">
                <Text className="text-lg">←</Text>
              </Pressable>
              <Text className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate)}
              </Text>
              <Pressable onPress={() => changeDate(1)} className="bg-gray-100 px-4 py-2 rounded-lg">
                <Text className="text-lg">→</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Progress Bar */}
        <View className="px-4 pb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-gray-500 text-sm">Progress</Text>
            <Text className="text-gray-500 text-sm">
              {completedCount}/{totalCount} ({progressPercent}%)
            </Text>
          </View>
          <View className="bg-gray-200 h-2 rounded-full overflow-hidden">
            <View
              className="bg-primary-500 h-full"
              style={{ width: `${progressPercent}%` }}
            />
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {TIME_BLOCKS.map((block) => {
          const blockTasks = generatedTasks.filter((t) => t.time_block === block.id);
          if (blockTasks.length === 0) return null;

          return (
            <Card key={block.id} className="mb-4">
              <View className="flex-row items-center gap-2 mb-4">
                <Text className="text-2xl">{block.icon}</Text>
                <Text className="text-lg font-semibold text-gray-900">{block.label}</Text>
              </View>

              {blockTasks.map((task) => {
                const completed = isTaskCompleted(task.id);
                const pet = guidePets.find((p) => p.id === task.pet_id);

                return (
                  <Pressable
                    key={task.id}
                    onPress={() => handleToggleTask(task)}
                    className={`flex-row items-start p-3 mb-2 rounded-lg border ${
                      completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                    }`}
                  >
                    <View
                      className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                        completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                      }`}
                    >
                      {completed && <Text className="text-white text-xs">✓</Text>}
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`font-medium ${
                          completed ? 'text-green-700 line-through' : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </Text>
                      {task.description && (
                        <Text className={`text-sm ${completed ? 'text-green-600' : 'text-gray-500'}`}>
                          {task.description}
                        </Text>
                      )}
                      {task.time && (
                        <Text className={`text-xs ${completed ? 'text-green-500' : 'text-gray-400'}`}>
                          ⏰ {task.time}
                        </Text>
                      )}
                      {pet && (
                        <Text className={`text-xs ${completed ? 'text-green-500' : 'text-gray-400'}`}>
                          🐾 {pet.name}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          );
        })}

        {generatedTasks.length === 0 && (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">📋</Text>
            <Text className="text-xl font-semibold text-gray-900 mb-2">No Tasks</Text>
            <Text className="text-gray-500 text-center">
              Add feeding schedules and medications to your pets to generate daily tasks.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
