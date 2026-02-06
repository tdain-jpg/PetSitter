import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Select } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, Pet, RoutineTask, TaskCompletion, TimeBlock, TaskCategory } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'DailyRoutine'>;

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
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [customTasks, setCustomTasks] = useState<RoutineTask[]>([]);

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
            id: `med-${pet.id}-${med.id}`,
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
              id: `med-${pet.id}-${med.id}-${timeIndex}`,
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
        id: 'walk-morning',
        time_block: 'morning',
        title: 'Morning walk',
        is_recurring: true,
        is_custom: false,
        category: 'walk',
        order: order++,
      });
      tasks.push({
        id: 'walk-evening',
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
        id: 'litter-morning',
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
      id: 'water-morning',
      time_block: 'morning',
      title: 'Refresh water bowls',
      is_recurring: true,
      is_custom: false,
      category: 'water',
      order: order++,
    });

    return tasks;
  }, [guidePets]);

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
      // Create new task
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
        order: customTasks.length + generatedTasks.length,
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

    // Swap orders
    const otherTask = blockTasks[newIndex];
    const updatedTasks = customTasks.map((t) => {
      if (t.id === task.id) return { ...t, order: otherTask.order };
      if (t.id === otherTask.id) return { ...t, order: task.order };
      return t;
    });

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
            {Platform.OS === 'web' ? (
              <button
                onClick={() => navigation.goBack()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: COLORS.primary,
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
          {Platform.OS === 'web' ? (
            <button
              onClick={handleAddTask}
              style={{
                padding: '8px 16px',
                backgroundColor: COLORS.primary,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              + Add Task
            </button>
          ) : (
            <Button title="+ Add Task" onPress={handleAddTask} variant="primary" />
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
                  backgroundColor: COLORS.creamDark,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ←
              </button>
              <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.text }}>
                {formatDate(selectedDate)}
              </span>
              <button
                onClick={() => changeDate(1)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: COLORS.creamDark,
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
              <Pressable onPress={() => changeDate(-1)} className="bg-tan-100 px-4 py-2 rounded-lg">
                <Text className="text-lg">←</Text>
              </Pressable>
              <Text className="text-lg font-semibold text-brown-800">
                {formatDate(selectedDate)}
              </Text>
              <Pressable onPress={() => changeDate(1)} className="bg-tan-100 px-4 py-2 rounded-lg">
                <Text className="text-lg">→</Text>
              </Pressable>
            </>
          )}
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
                          <Text className={`text-xs ${completed ? 'text-primary-500' : 'text-tan-400'}`}>
                            ⏰ {task.time}
                          </Text>
                        )}
                        {pet && (
                          <Text className={`text-xs ${completed ? 'text-primary-500' : 'text-tan-400'}`}>
                            🐾 {pet.name}
                          </Text>
                        )}
                      </View>
                    </Pressable>

                    {/* Edit/Delete/Move buttons for custom tasks */}
                    {task.is_custom && (
                      <View className="flex-row justify-end gap-2 mt-1 px-2">
                        {Platform.OS === 'web' ? (
                          <>
                            {!isFirstCustom && (
                              <button
                                onClick={() => handleMoveTask(task, 'up')}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: COLORS.creamDark,
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 12,
                                }}
                              >
                                ↑
                              </button>
                            )}
                            {!isLastCustom && (
                              <button
                                onClick={() => handleMoveTask(task, 'down')}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: COLORS.creamDark,
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 12,
                                }}
                              >
                                ↓
                              </button>
                            )}
                            <button
                              onClick={() => handleEditTask(task)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: COLORS.primary100,
                                color: COLORS.secondary,
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: COLORS.accentLight,
                                color: COLORS.accent,
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            {!isFirstCustom && (
                              <Pressable
                                onPress={() => handleMoveTask(task, 'up')}
                                className="bg-tan-100 px-2 py-1 rounded"
                              >
                                <Text className="text-xs">↑</Text>
                              </Pressable>
                            )}
                            {!isLastCustom && (
                              <Pressable
                                onPress={() => handleMoveTask(task, 'down')}
                                className="bg-tan-100 px-2 py-1 rounded"
                              >
                                <Text className="text-xs">↓</Text>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => handleEditTask(task)}
                              className="bg-secondary-100 px-2 py-1 rounded"
                            >
                              <Text className="text-secondary-600 text-xs">Edit</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleDeleteTask(task.id)}
                              className="bg-accent-100 px-2 py-1 rounded"
                            >
                              <Text className="text-accent-600 text-xs">Delete</Text>
                            </Pressable>
                          </>
                        )}
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
                {Platform.OS === 'web' ? (
                  <button
                    onClick={() => setShowTaskModal(false)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 20,
                    }}
                  >
                    ✕
                  </button>
                ) : (
                  <Pressable onPress={() => setShowTaskModal(false)}>
                    <Text className="text-2xl text-tan-400">✕</Text>
                  </Pressable>
                )}
              </View>

              {/* Task Title */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Task Title *</Text>
                <TextInput
                  className="border border-tan-300 rounded-lg px-4 py-3 text-brown-800"
                  value={taskForm.title}
                  onChangeText={(text) => setTaskForm((f) => ({ ...f, title: text }))}
                  placeholder="e.g., Give treats"
                />
              </View>

              {/* Description */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Description</Text>
                <TextInput
                  className="border border-tan-300 rounded-lg px-4 py-3 text-brown-800"
                  value={taskForm.description}
                  onChangeText={(text) => setTaskForm((f) => ({ ...f, description: text }))}
                  placeholder="Brief description of the task"
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Notes */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Notes</Text>
                <TextInput
                  className="border border-tan-300 rounded-lg px-4 py-3 text-brown-800"
                  value={taskForm.notes}
                  onChangeText={(text) => setTaskForm((f) => ({ ...f, notes: text }))}
                  placeholder="Additional notes for the sitter"
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Time Block */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Time Block *</Text>
                <Select
                  value={taskForm.time_block}
                  onValueChange={(value) => setTaskForm((f) => ({ ...f, time_block: value as TimeBlock }))}
                  options={TIME_BLOCKS.map((tb) => ({ value: tb.id, label: `${tb.icon} ${tb.label}` }))}
                />
              </View>

              {/* Specific Time */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Specific Time (optional)</Text>
                <TextInput
                  className="border border-tan-300 rounded-lg px-4 py-3 text-brown-800"
                  value={taskForm.time}
                  onChangeText={(text) => setTaskForm((f) => ({ ...f, time: text }))}
                  placeholder="e.g., 14:30 or 2:30 PM"
                />
              </View>

              {/* Category */}
              <View className="mb-4">
                <Text className="text-sm font-medium text-brown-600 mb-1">Category</Text>
                <Select
                  value={taskForm.category}
                  onValueChange={(value) => setTaskForm((f) => ({ ...f, category: value as TaskCategory }))}
                  options={TASK_CATEGORIES}
                />
              </View>

              {/* Pet Selection */}
              {guidePets.length > 0 && (
                <View className="mb-4">
                  <Text className="text-sm font-medium text-brown-600 mb-1">For Pet (optional)</Text>
                  <Select
                    value={taskForm.pet_id}
                    onValueChange={(value) => setTaskForm((f) => ({ ...f, pet_id: value }))}
                    options={[
                      { value: '', label: 'General (no specific pet)' },
                      ...guidePets.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </View>
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
