import { View, Text, Pressable, Switch } from 'react-native';
import { Input } from './Input';
import { Select } from './Select';
import { generateId } from '../services';
import type { Medication } from '../types';

interface MedicationEditorProps {
  label?: string;
  medications: Medication[];
  onChange: (medications: Medication[]) => void;
}

const FREQUENCY_OPTIONS = [
  { label: 'Once daily', value: 'Once daily' },
  { label: 'Twice daily', value: 'Twice daily' },
  { label: 'Three times daily', value: 'Three times daily' },
  { label: 'Every other day', value: 'Every other day' },
  { label: 'Weekly', value: 'Weekly' },
  { label: 'Monthly', value: 'Monthly' },
  { label: 'As needed', value: 'As needed' },
];

// Helper to determine number of time inputs based on frequency
function getTimeCount(frequency: string): number {
  switch (frequency) {
    case 'Twice daily':
      return 2;
    case 'Three times daily':
      return 3;
    case 'Once daily':
    case 'Every other day':
    case 'Weekly':
    case 'Monthly':
      return 1;
    case 'As needed':
    default:
      return 0;
  }
}

// Labels for each time slot
function getTimeLabel(frequency: string, index: number): string {
  if (frequency === 'Twice daily') {
    return index === 0 ? 'Morning' : 'Evening';
  }
  if (frequency === 'Three times daily') {
    return ['Morning', 'Midday', 'Evening'][index] || `Time ${index + 1}`;
  }
  return 'Time';
}

export function MedicationEditor({
  label,
  medications,
  onChange,
}: MedicationEditorProps) {
  const addMedication = () => {
    const newMed: Medication = {
      id: generateId(),
      name: '',
      dosage: '',
      frequency: 'Once daily',
      times: [''],
    };
    onChange([...medications, newMed]);
  };

  const updateMedication = (id: string, updates: Partial<Medication>) => {
    onChange(
      medications.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const removeMedication = (id: string) => {
    onChange(medications.filter((m) => m.id !== id));
  };

  const handleFrequencyChange = (id: string, frequency: string, currentTimes: string[] | undefined) => {
    const timeCount = getTimeCount(frequency);
    const prev = currentTimes || [];
    const times = timeCount > 0
      ? Array.from({ length: timeCount }, (_, i) => prev[i] || '')
      : undefined;
    updateMedication(id, { frequency, times });
  };

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}

      {medications.map((med, index) => (
        <View
          key={med.id}
          className="bg-cream-200 rounded-lg p-4 mb-3 border border-tan-200"
        >
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-sm font-medium text-tan-600">
              Medication {index + 1}
            </Text>
            <Pressable
              onPress={() => removeMedication(med.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove medication ${index + 1}`}
              className="px-3 py-1 bg-accent-50 rounded"
            >
              <Text className="text-accent-600 text-xs">Remove</Text>
            </Pressable>
          </View>

          <Input
            label="Medication Name"
            placeholder="e.g., Heartgard"
            value={med.name}
            onChangeText={(name) => updateMedication(med.id, { name })}
          />

          <Input
            label="Dosage"
            placeholder="e.g., 1 tablet"
            value={med.dosage}
            onChangeText={(dosage) => updateMedication(med.id, { dosage })}
          />

          <Select
            label="Frequency"
            value={med.frequency}
            options={FREQUENCY_OPTIONS}
            onValueChange={(frequency) => handleFrequencyChange(med.id, frequency, med.times)}
          />

          {getTimeCount(med.frequency) > 0 &&
            Array.from({ length: getTimeCount(med.frequency) }).map((_, timeIndex) => (
              <Input
                key={timeIndex}
                label={getTimeLabel(med.frequency, timeIndex)}
                placeholder="08:00"
                value={(med.times && med.times[timeIndex]) || ''}
                onChangeText={(time) => {
                  const newTimes = [...(med.times || [])];
                  newTimes[timeIndex] = time;
                  updateMedication(med.id, { times: newTimes });
                }}
              />
            ))
          }

          <View className="flex-row items-center mb-4">
            <Switch
              value={med.with_food || false}
              onValueChange={(with_food) =>
                updateMedication(med.id, { with_food })
              }
            />
            <Text className="ml-2 text-brown-600">Give with food</Text>
          </View>

          <Input
            label="Notes (optional)"
            placeholder="Any special instructions"
            value={med.notes || ''}
            onChangeText={(notes) =>
              updateMedication(med.id, { notes: notes || undefined })
            }
            multiline
          />
        </View>
      ))}

      <Pressable
        onPress={addMedication}
        accessibilityRole="button"
        accessibilityLabel="Add medication"
        className="px-4 py-2 bg-secondary-50 rounded-lg self-start"
      >
        <Text className="text-secondary-600 font-medium">+ Add Medication</Text>
      </Pressable>
    </View>
  );
}
