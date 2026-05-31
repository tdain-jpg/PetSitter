import { View, Text, Pressable } from 'react-native';
import { Input } from './Input';
import { generateId } from '../services';
import type { FeedingSchedule } from '../types';

interface ScheduleEditorProps {
  label?: string;
  schedules: FeedingSchedule[];
  onChange: (schedules: FeedingSchedule[]) => void;
}

export function ScheduleEditor({
  label,
  schedules,
  onChange,
}: ScheduleEditorProps) {
  const addSchedule = () => {
    const newSchedule: FeedingSchedule = {
      id: generateId(),
      time: '08:00',
      food_type: '',
      amount: '',
    };
    onChange([...schedules, newSchedule]);
  };

  const updateSchedule = (id: string, updates: Partial<FeedingSchedule>) => {
    onChange(
      schedules.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const removeSchedule = (id: string) => {
    onChange(schedules.filter((s) => s.id !== id));
  };

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}

      {schedules.map((schedule, index) => (
        <View
          key={schedule.id}
          className="bg-cream-200 rounded-lg p-4 mb-3 border border-tan-200"
        >
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-sm font-medium text-tan-600">
              Feeding {index + 1}
            </Text>
            <Pressable
              onPress={() => removeSchedule(schedule.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove feeding ${index + 1}`}
              className="px-3 py-1 bg-accent-50 rounded"
            >
              <Text className="text-accent-600 text-xs">Remove</Text>
            </Pressable>
          </View>

          <View className="gap-2">
            <Input
              label="Time"
              placeholder="08:00"
              value={schedule.time}
              onChangeText={(time) => updateSchedule(schedule.id, { time })}
            />
            <Input
              label="Food Type"
              placeholder="e.g., Dry kibble"
              value={schedule.food_type}
              onChangeText={(food_type) =>
                updateSchedule(schedule.id, { food_type })
              }
            />
            <Input
              label="Amount"
              placeholder="e.g., 1 cup"
              value={schedule.amount}
              onChangeText={(amount) =>
                updateSchedule(schedule.id, { amount })
              }
            />
          </View>

          <View className="mt-2">
            <Input
              label="Notes (optional)"
              placeholder="Any special instructions"
              value={schedule.notes || ''}
              onChangeText={(notes) =>
                updateSchedule(schedule.id, { notes: notes || undefined })
              }
            />
          </View>
        </View>
      ))}

      <Pressable
        onPress={addSchedule}
        accessibilityRole="button"
        accessibilityLabel="Add feeding schedule"
        className="px-4 py-2 bg-secondary-50 rounded-lg self-start"
      >
        <Text className="text-secondary-600 font-medium">
          + Add Feeding Schedule
        </Text>
      </Pressable>
    </View>
  );
}
