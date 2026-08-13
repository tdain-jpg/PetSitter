import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, Select } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet, RoutineTask, TaskCompletion, TimeBlock, TaskCategory } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'DailyRoutine'>;

const TIME_BLOCKS: { id: TimeBlock; label: string; icon: string }[] = [
  { id: 'morning', label: 'Morning', icon: '🌅' },
  { id: 'midday', label: 'Midday', icon: '☀️' },
  { id: 'evening', label: 'Evening', icon: '🌆' },
  { id: 'bedtime', label: 'Bedtime', icon: '🌙' },
];

const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'feeding', label: 'Feeding' },
  { value: 'medication', label: 'Medication' },
  { value: 'walk', label: 'Walk' },
  { value: 'play', label: 'Play' },
  { value: 'grooming', label: 'Grooming' },
  { value: 'litter', label: 'Litter' },
  { value: 'water', label: 'Water' },
  { value: 'other', label: 'Other' },
];

const generateId = () => `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Date keys use the LOCAL calendar day. toISOString() is UTC — for a US user
// after ~5-8pm local it is already tomorrow's date, so completions would be
// recorded (and read back) under the wrong day.
const toLocalDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse a YYYY-MM-DD key as a LOCAL date. `new Date('YYYY-MM-DD')` parses as
// UTC midnight, which renders as the previous day west of UTC.
const parseLocalDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function DailyRoutineScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const {
    guides,
    activePets,
    deceasedPets,
    getTaskCompletions,
    markTaskComplete,
    markTaskIncomplete,
    updateGuide,
  } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePets, setGuidePets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [customTasks, setCustomTasks] = useState<RoutineTask[]>([]);

  // Task ids with a toggle currently in flight — taps on them are ignored so
  // rapid double-taps can't fire duplicate requests.
  const pendingTaskIds = useRef<Set<string>>(new Set());

  // Modal state for adding/editing tasks
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<RoutineTask | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    notes: '',
    time_block: 'morning' as TimeBlock,
    time: '',
    category: 'other' as TaskCategory,
    pet_id: '',
    is_recurring: true,
  });

  useEffect(() => {
    loadData();
  }, [guideId, guides]);

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
        // Load custom tasks from guide's daily_routine
        if (foundGuide.daily_routine?.tasks) {
          setCustomTasks(foundGuide.daily_routine.tasks.filter((t) => t.is_custom));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCompletions = async () => {
    const data = await getTaskCompletions(guideId, selectedDate);
    setCompletions(data);
  };

  // Generate tasks from pet schedules.
  // Every generated id is prefixed with the guide id: completions are keyed by
  // (guide_id, task_id, date), and unprefixed ids ('walk-morning',
  // 'feeding-<petId>-...') would repeat across guides covering the same pet
  // (or duplicated guides), colliding in the checklist history.
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
          id: `feeding-${guideId}-${pet.id}-${feeding.id}`,
          pet_id: pet.id,
          time_block: timeBlock,
          time: feeding.time,
          title: `Feed ${pet.name}`,
          description: `${feeding.amount} of ${feeding.food_type}${feeding.notes ? ` - ${feeding.notes}` : ''}`,
          is_recurring: true,
          is_custom: false,
          category: 'feeding',
          order: order++,
        });
      });

      // Medication tasks - create one task per time
      pet.medications.forEach((med) => {
        const times = med.times?.filter(t => t) || [];

        // If no specific times, create a single morning task
        if (times.length === 0) {
          tasks.push({
            id: `med-${guideId}-${pet.id}-${med.id}`,
            pet_id: pet.id,
            time_block: 'morning',
            title: `Give ${pet.name} medication`,
            description: `${med.name}: ${med.dosage}${med.with_food ? ' (with food)' : ''}${med.notes ? ` - ${med.notes}` : ''}`,
            is_recurring: true,
            is_custom: false,
            category: 'medication',
            order: order++,
          });
        } else {
          // Create a task for each time
          times.forEach((time, timeIndex) => {
            let timeBlock: TimeBlock = 'morning';
            const hour = parseInt(time.split(':')[0], 10);
            if (hour >= 11 && hour < 15) timeBlock = 'midday';
            else if (hour >= 15 && hour < 20) timeBlock = 'evening';
            else if (hour >= 20 || hour < 6) timeBlock = 'bedtime';

            tasks.push({
              id: `med-${guideId}-${pet.id}-${med.id}-${timeIndex}`,
              pet_id: pet.id,
              time_block: timeBlock,
              time: time,
              title: `Give ${pet.name} medication`,
              description: `${med.name}: ${med.dosage}${med.with_food ? ' (with food)' : ''}${med.notes ? ` - ${med.notes}` : ''}`,
              is_recurring: true,
              is_custom: false,
              category: 'medication',
              order: order++,
            });
          });
        }
      });
    });

    // Add general tasks
    if (guidePets.some((p) => p.species === 'dog')) {
      tasks.push({
        id: `gd-${guideId}-walk-morning`,
        time_block: 'morning',
        title: 'Morning walk',
        is_recurring: true,
        is_custom: false,
        category: 'walk',
        order: order++,
      });
      tasks.push({
        id: `gd-${guideId}-walk-evening`,
        time_block: 'evening',
        title: 'Evening walk',
        is_recurring: true,
        is_custom: false,
        category: 'walk',
        order: order++,
      });
    }

    if (guidePets.some((p) => p.species === 'cat')) {
      tasks.push({
        id: `gd-${guideId}-litter-morning`,
        time_block: 'morning',
        title: 'Clean litter box',
        is_recurring: true,
        is_custom: false,
        category: 'litter',
        order: order++,
      });
    }

    // Water refresh
    tasks.push({
      id: `gd-${guideId}-water-morning`,
      time_block: 'morning',
      title: 'Refresh water bowls',
      is_recurring: true,
      is_custom: false,
      category: 'water',
      order: order++,
    });

    return tasks;
  }, [guidePets, guideId]);

  // Combine auto-generated and custom tasks
  const allTasks = useMemo(() => {
    const combined = [...generatedTasks, ...customTasks];
    // Sort by time block order, then by custom order, then by time
    return combined.sort((a, b) => {
      const blockOrder = TIME_BLOCKS.findIndex((tb) => tb.id === a.time_block) -
        TIME_BLOCKS.findIndex((tb) => tb.id === b.time_block);
      if (blockOrder !== 0) return blockOrder;
      if (a.order !== b.order) return a.order - b.order;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    });
  }, [generatedTasks, customTasks]);

  const isTaskCompleted = (taskId: string) => {
    return completions.some((c) => c.task_id === taskId);
  };

  const handleToggleTask = async (task: RoutineTask) => {
    // Ignore taps while a toggle for this task is already in flight
    if (pendingTaskIds.current.has(task.id)) return;
    pendingTaskIds.current.add(task.id);

    const isCompleted = isTaskCompleted(task.id);
    try {
      if (isCompleted) {
        await markTaskIncomplete(guideId, task.id, selectedDate);
        setCompletions((prev) => prev.filter((c) => c.task_id !== task.id));
      } else {
        const completion = await markTaskComplete({
          task_id: task.id,
          guide_id: guideId,
          date: selectedDate,
          completed_at: new Date().toISOString(),
        });
        setCompletions((prev) => [
          ...prev.filter((c) => c.task_id !== task.id),
          completion,
        ]);
      }
    } catch (err: any) {
      // State is only mutated after a successful write, so the checkbox
      // stays in its pre-tap state — just tell the user why.
      showAlert('Error', err?.message || 'Failed to update the task. Please try again.');
    } finally {
      pendingTaskIds.current.delete(task.id);
    }
  };

  const changeDate = (offset: number) => {
    const date = parseLocalDateKey(selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(toLocalDateKey(date));
  };

  const formatDate = (dateStr: string) => {
    const now = new Date();
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);

    if (dateStr === toLocalDateKey(now)) return 'Today';
    if (dateStr === toLocalDateKey(tomorrowDate)) return 'Tomorrow';
    if (dateStr === toLocalDateKey(yesterdayDate)) return 'Yesterday';

    return parseLocalDateKey(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Save custom tasks to guide
  const saveCustomTasks = async (updatedTasks: RoutineTask[]) => {
    if (!guide) return;
    const dailyRoutine = guide.daily_routine || { id: guideId, guide_id: guideId, tasks: [] };
    await updateGuide(guideId, {
      daily_routine: {
        ...dailyRoutine,
        tasks: updatedTasks,
      },
    });
    setCustomTasks(updatedTasks);
  };

  // Open modal to add new task
  const handleAddTask = () => {
    setEditingTask(null);
    setTaskForm({
      title: '',
      description: '',
      notes: '',
      time_block: 'morning',
      time: '',
      category: 'other',
      pet_id: '',
      is_recurring: true,
    });
    setShowTaskModal(true);
  };

  // Open modal to edit existing task
  const handleEditTask = (task: RoutineTask) => {
    if (!task.is_custom) return; // Can only edit custom tasks
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      notes: task.notes || '',
      time_block: task.time_block,
      time: task.time || '',
      category: task.category,
      pet_id: task.pet_id || '',
      is_recurring: task.is_recurring,
    });
    setShowTaskModal(true);
  };

  // Save task from modal
  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) return;

    if (editingTask) {
      // Update existing task
      const updatedTasks = customTasks.map((t) =>
        t.id === editingTask.id
          ? {
              ...t,
              ...taskForm,
              pet_id: taskForm.pet_id || undefined,
            }
          : t
      );
      await saveCustomTasks(updatedTasks);
    } else {
      // Create new task. Order is max(existing)+1 — counting tasks
      // (customTasks.length + generatedTasks.length) could collide with an
      // existing order when the generated count later shrinks, which would
      // make the move up/down swap a no-op.
      const maxOrder = [...generatedTasks, ...customTasks].reduce(
        (max, t) => Math.max(max, t.order),
        -1
      );
      const newTask: RoutineTask = {
        id: generateId(),
        title: taskForm.title,
        description: taskForm.description || undefined,
        notes: taskForm.notes || undefined,
        time_block: taskForm.time_block,
        time: taskForm.time || undefined,
        category: taskForm.category,
        pet_id: taskForm.pet_id || undefined,
        is_recurring: taskForm.is_recurring,
        is_custom: true,
        order: maxOrder + 1,
      };
      await saveCustomTasks([...customTasks, newTask]);
    }

    setShowTaskModal(false);
  };

  // Delete custom task
  const handleDeleteTask = async (taskId: string) => {
    const updatedTasks = customTasks.filter((t) => t.id !== taskId);
    await saveCustomTasks(updatedTasks);
  };

  // Move task up or down within its time block
  const handleMoveTask = async (task: RoutineTask, direction: 'up' | 'down') => {
    if (!task.is_custom) return;

    const blockTasks = customTasks
      .filter((t) => t.time_block === task.time_block)
      .sort((a, b) => a.order - b.order);

    const currentIndex = blockTasks.findIndex((t) => t.id === task.id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= blockTasks.length) return;

    // Reorder within the block, then NORMALIZE orders to sequential values.
    // Swapping raw order values is a no-op when two tasks ended up with the
    // same order (possible when the generated task count changed between
    // creates). Custom orders start after the generated tasks' 0..n-1 range
    // so they keep sorting after them within a time block.
    const reordered = [...blockTasks];
    [reordered[currentIndex], reordered[newIndex]] = [reordered[newIndex], reordered[currentIndex]];
    const base = generatedTasks.length;
    const orderById = new Map(reordered.map((t, i) => [t.id, base + i]));
    const updatedTasks = customTasks.map((t) =>
      orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t
    );

    await saveCustomTasks(updatedTasks);
  };

  const completedCount = allTasks.filter((t) => isTaskCompleted(t.id)).length;
  const totalCount = allTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.primary} />
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
      <View className="bg-cream-50 border-b border-tan-200">
        <View className="flex-row items-center justify-between px-4 pt-12 pb-2">
          <View className="flex-row items-center">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <Button title="+ Add Task" onPress={handleAddTask} variant="primary" />
        </View>

        {/* Date Navigator */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable
            onPress={() => changeDate(-1)}
            className="bg-tan-100 px-4 py-2 rounded-lg"
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Text className="text-lg">←</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-brown-800">
            {formatDate(selectedDate)}
          </Text>
          <Pressable
            onPress={() => changeDate(1)}
            className="bg-tan-100 px-4 py-2 rounded-lg"
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Text className="text-lg">→</Text>
          </Pressable>
        </View>

        {/* Progress Bar */}
        <View className="px-4 pb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-tan-500 text-sm">Progress</Text>
            <Text className="text-tan-500 text-sm">
              {completedCount}/{totalCount} ({progressPercent}%)
            </Text>
          </View>
          <View className="bg-tan-200 h-2 rounded-full overflow-hidden">
            <View
              className="bg-primary-500 h-full"
              style={{ width: `${progressPercent}%` }}
            />
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {TIME_BLOCKS.map((block) => {
          const blockTasks = allTasks.filter((t) => t.time_block === block.id);
          if (blockTasks.length === 0) return null;

          return (
            <Card key={block.id} className="mb-4">
              <View className="flex-row items-center gap-2 mb-4">
                <Text className="text-2xl">{block.icon}</Text>
                <Text className="text-lg font-semibold text-brown-800">{block.label}</Text>
              </View>

              {blockTasks.map((task, taskIndex) => {
                const completed = isTaskCompleted(task.id);
                const pet = guidePets.find((p) => p.id === task.pet_id);
                const customBlockTasks = blockTasks.filter((t) => t.is_custom);
                const isFirstCustom = task.is_custom && customBlockTasks[0]?.id === task.id;
                const isLastCustom = task.is_custom && customBlockTasks[customBlockTasks.length - 1]?.id === task.id;

                return (
                  <View key={task.id} className="mb-2">
                    <Pressable
                      onPress={() => handleToggleTask(task)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={task.title}
                      accessibilityState={{ checked: completed }}
                      className={`flex-row items-start p-3 rounded-lg border ${
                        completed ? 'bg-primary-50 border-primary-200' : 'bg-cream-50 border-tan-200'
                      }`}
                    >
                      <View
                        className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                          completed ? 'bg-primary-500 border-primary-500' : 'border-tan-300'
                        }`}
                      >
                        {completed && <Text className="text-white text-xs">✓</Text>}
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className={`font-medium flex-1 ${
                              completed ? 'text-primary-700 line-through' : 'text-brown-800'
                            }`}
                          >
                            {task.title}
                          </Text>
                          {task.is_custom && (
                            <View className="bg-secondary-100 px-2 py-0.5 rounded">
                              <Text className="text-secondary-700 text-xs">Custom</Text>
                            </View>
                          )}
                        </View>
                        {task.description && (
                          <Text className={`text-sm ${completed ? 'text-primary-600' : 'text-tan-500'}`}>
                            {task.description}
                          </Text>
                        )}
                        {task.notes && (
                          <Text className={`text-sm italic ${completed ? 'text-primary-500' : 'text-tan-400'}`}>
                            Note: {task.notes}
                          </Text>
                        )}
                        {task.time && (
                          <Text className={`text-sm ${completed ? 'text-primary-500' : 'text-tan-500'}`}>
                            ⏰ {task.time}
                          </Text>
                        )}
                        {pet && (
                          <Text className={`text-sm ${completed ? 'text-primary-500' : 'text-tan-500'}`}>
                            🐾 {pet.name}
                          </Text>
                        )}
                      </View>
                    </Pressable>

                    {/* Edit/Delete/Move buttons for custom tasks */}
                    {task.is_custom && (
                      <View className="flex-row justify-end gap-2 mt-1 px-2">
                        {!isFirstCustom && (
                          <Pressable
                            onPress={() => handleMoveTask(task, 'up')}
                            className="bg-tan-100 px-2 py-1 rounded"
                            accessibilityRole="button"
                            accessibilityLabel="Move task up"
                          >
                            <Text className="text-xs">↑</Text>
                          </Pressable>
                        )}
                        {!isLastCustom && (
                          <Pressable
                            onPress={() => handleMoveTask(task, 'down')}
                            className="bg-tan-100 px-2 py-1 rounded"
                            accessibilityRole="button"
                            accessibilityLabel="Move task down"
                          >
                            <Text className="text-xs">↓</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleEditTask(task)}
                          className="bg-secondary-100 px-2 py-1 rounded"
                          accessibilityRole="button"
                          accessibilityLabel="Edit task"
                        >
                          <Text className="text-secondary-600 text-xs">Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteTask(task.id)}
                          className="bg-accent-100 px-2 py-1 rounded"
                          accessibilityRole="button"
                          accessibilityLabel="Delete task"
                        >
                          <Text className="text-accent-600 text-xs">Delete</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })}

        {allTasks.length === 0 && (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">📋</Text>
            <Text className="text-xl font-semibold text-brown-800 mb-2">No Tasks</Text>
            <Text className="text-tan-500 text-center mb-4">
              Add feeding schedules and medications to your pets, or create custom tasks.
            </Text>
            <Button title="+ Add Custom Task" onPress={handleAddTask} variant="primary" />
          </Card>
        )}
      </ScrollView>

      {/* Add/Edit Task Modal */}
      <Modal
        visible={showTaskModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTaskModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-cream-50 rounded-t-3xl p-6 max-h-[85%]">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-brown-800">
                  {editingTask ? 'Edit Task' : 'Add Custom Task'}
                </Text>
                <Pressable
                  onPress={() => setShowTaskModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close task modal"
                >
                  <Text className="text-2xl text-tan-400">✕</Text>
                </Pressable>
              </View>

              {/* Task Title */}
              <Input
                label="Task Title *"
                value={taskForm.title}
                onChangeText={(text) => setTaskForm((f) => ({ ...f, title: text }))}
                placeholder="e.g., Give treats"
                autoCapitalize="sentences"
              />

              {/* Description */}
              <Input
                label="Description"
                value={taskForm.description}
                onChangeText={(text) => setTaskForm((f) => ({ ...f, description: text }))}
                placeholder="Brief description of the task"
                autoCapitalize="sentences"
                multiline
                numberOfLines={2}
              />

              {/* Notes */}
              <Input
                label="Notes"
                value={taskForm.notes}
                onChangeText={(text) => setTaskForm((f) => ({ ...f, notes: text }))}
                placeholder="Additional notes for the sitter"
                autoCapitalize="sentences"
                multiline
                numberOfLines={2}
              />

              {/* Time Block */}
              <Select
                label="Time Block *"
                value={taskForm.time_block}
                onValueChange={(value) => setTaskForm((f) => ({ ...f, time_block: value as TimeBlock }))}
                options={TIME_BLOCKS.map((tb) => ({ value: tb.id, label: `${tb.icon} ${tb.label}` }))}
              />

              {/* Specific Time */}
              <Input
                label="Specific Time (optional)"
                value={taskForm.time}
                onChangeText={(text) => setTaskForm((f) => ({ ...f, time: text }))}
                placeholder="e.g., 14:30 or 2:30 PM"
              />

              {/* Category */}
              <Select
                label="Category"
                value={taskForm.category}
                onValueChange={(value) => setTaskForm((f) => ({ ...f, category: value as TaskCategory }))}
                options={TASK_CATEGORIES}
              />

              {/* Pet Selection */}
              {guidePets.length > 0 && (
                <Select
                  label="For Pet (optional)"
                  value={taskForm.pet_id}
                  onValueChange={(value) => setTaskForm((f) => ({ ...f, pet_id: value }))}
                  options={[
                    { value: '', label: 'General (no specific pet)' },
                    ...guidePets.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              )}

              {/* Is Recurring */}
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-sm font-medium text-brown-600">Daily Recurring Task</Text>
                <Switch
                  value={taskForm.is_recurring}
                  onValueChange={(value) => setTaskForm((f) => ({ ...f, is_recurring: value }))}
                  trackColor={{ false: COLORS.border, true: COLORS.primary100 }}
                  thumbColor={taskForm.is_recurring ? COLORS.primary : COLORS.tan}
                />
              </View>

              {/* Action Buttons */}
              <View className="gap-3">
                <Button
                  title={editingTask ? 'Save Changes' : 'Add Task'}
                  onPress={handleSaveTask}
                  variant="primary"
                  disabled={!taskForm.title.trim()}
                />
                <Button
                  title="Cancel"
                  onPress={() => setShowTaskModal(false)}
                  variant="outline"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
