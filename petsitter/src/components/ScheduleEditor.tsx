import { View, Text, Pressable, Platform } from 'react-native';
import { Input } from './Input';
import { COLORS } from '../constants';
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

  const buttonStyle = Platform.OS === 'web'
    ? {
        padding: '8px 16px',
        backgroundColor: COLORS.secondaryLight,
        color: COLORS.secondary,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
      }
    : undefined;

  const removeButtonStyle = Platform.OS === 'web'
    ? {
        padding: '6px 12px',
        backgroundColor: COLORS.accentLight,
        color: COLORS.accent,
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
      }
    : undefined;

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
            {Platform.OS === 'web' ? (
              <button
                onClick={() => removeSchedule(schedule.id)}
                style={removeButtonStyle}
              >
                Remove
              </button>
            ) : (
              <Pressable
                onPress={() => removeSchedule(schedule.id)}
                className="px-3 py-1 bg-accent-50 rounded"
              >
                <Text className="text-accent-600 text-xs">Remove</Text>
              </Pressable>
            )}
          </View>

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: COLORS.tan, marginBottom: 4 }}>
                  Time
                </label>
                <input
                  type="time"
                  value={schedule.time}
                  onChange={(e) => updateSchedule(schedule.id, { time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: COLORS.tan, marginBottom: 4 }}>
                  Food Type
                </label>
                <input
                  type="text"
                  value={schedule.food_type}
                  onChange={(e) => updateSchedule(schedule.id, { food_type: e.target.value })}
                  placeholder="e.g., Dry kibble"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: COLORS.tan, marginBottom: 4 }}>
                  Amount
                </label>
                <input
                  type="text"
                  value={schedule.amount}
                  onChange={(e) => updateSchedule(schedule.id, { amount: e.target.value })}
                  placeholder="e.g., 1 cup"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
          ) : (
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
          )}

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

      {Platform.OS === 'web' ? (
        <button onClick={addSchedule} style={buttonStyle}>
          + Add Feeding Schedule
        </button>
      ) : (
        <Pressable
          onPress={addSchedule}
          className="px-4 py-2 bg-secondary-50 rounded-lg self-start"
        >
          <Text className="text-secondary-600 font-medium">
            + Add Feeding Schedule
          </Text>
        </Pressable>
      )}
    </View>
  );
}
