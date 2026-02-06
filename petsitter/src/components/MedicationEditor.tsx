import { View, Text, Pressable, Platform, Switch } from 'react-native';
import { Input } from './Input';
import { COLORS } from '../constants';
import { generateId } from '../services';
import type { Medication } from '../types';

interface MedicationEditorProps {
  label?: string;
  medications: Medication[];
  onChange: (medications: Medication[]) => void;
}

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

      {medications.map((med, index) => (
        <View
          key={med.id}
          className="bg-cream-200 rounded-lg p-4 mb-3 border border-tan-200"
        >
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-sm font-medium text-tan-600">
              Medication {index + 1}
            </Text>
            {Platform.OS === 'web' ? (
              <button
                onClick={() => removeMedication(med.id)}
                style={removeButtonStyle}
              >
                Remove
              </button>
            ) : (
              <Pressable
                onPress={() => removeMedication(med.id)}
                className="px-3 py-1 bg-accent-50 rounded"
              >
                <Text className="text-accent-600 text-xs">Remove</Text>
              </Pressable>
            )}
          </View>

          <Input
            label="Medication Name"
            placeholder="e.g., Heartgard"
            value={med.name}
            onChangeText={(name) => updateMedication(med.id, { name })}
          />

          {Platform.OS === 'web' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, color: COLORS.brown, marginBottom: 8, fontWeight: 500 }}>
                  Dosage
                </label>
                <input
                  type="text"
                  value={med.dosage}
                  onChange={(e) => updateMedication(med.id, { dosage: e.target.value })}
                  placeholder="e.g., 1 tablet"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, color: COLORS.brown, marginBottom: 8, fontWeight: 500 }}>
                  Frequency
                </label>
                <select
                  value={med.frequency}
                  onChange={(e) => {
                    const newFrequency = e.target.value;
                    const timeCount = getTimeCount(newFrequency);
                    const currentTimes = med.times || [];
                    // Initialize times array based on frequency
                    const newTimes = timeCount > 0
                      ? Array.from({ length: timeCount }, (_, i) => currentTimes[i] || '')
                      : undefined;
                    updateMedication(med.id, { frequency: newFrequency, times: newTimes });
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                    backgroundColor: 'white',
                  }}
                >
                  <option value="Once daily">Once daily</option>
                  <option value="Twice daily">Twice daily</option>
                  <option value="Three times daily">Three times daily</option>
                  <option value="Every other day">Every other day</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="As needed">As needed</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <Input
                label="Dosage"
                placeholder="e.g., 1 tablet"
                value={med.dosage}
                onChangeText={(dosage) => updateMedication(med.id, { dosage })}
              />
              <Input
                label="Frequency"
                placeholder="e.g., Once daily"
                value={med.frequency}
                onChangeText={(frequency) => {
                  const timeCount = getTimeCount(frequency);
                  const currentTimes = med.times || [];
                  const newTimes = timeCount > 0
                    ? Array.from({ length: timeCount }, (_, i) => currentTimes[i] || '')
                    : undefined;
                  updateMedication(med.id, { frequency, times: newTimes });
                }}
              />
            </>
          )}

          {Platform.OS === 'web' ? (
            <>
              {getTimeCount(med.frequency) > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: getTimeCount(med.frequency) === 3 ? '1fr 1fr 1fr' : '1fr 1fr',
                  gap: 12,
                  marginBottom: 12
                }}>
                  {Array.from({ length: getTimeCount(med.frequency) }).map((_, timeIndex) => (
                    <div key={timeIndex}>
                      <label style={{ display: 'block', fontSize: 14, color: COLORS.brown, marginBottom: 8, fontWeight: 500 }}>
                        {getTimeLabel(med.frequency, timeIndex)}
                      </label>
                      <input
                        type="time"
                        value={(med.times && med.times[timeIndex]) || ''}
                        onChange={(e) => {
                          const newTimes = [...(med.times || [])];
                          newTimes[timeIndex] = e.target.value;
                          updateMedication(med.id, { times: newTimes });
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 16,
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={med.with_food || false}
                    onChange={(e) => updateMedication(med.id, { with_food: e.target.checked })}
                    style={{ marginRight: 8, width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14, color: COLORS.brown }}>Give with food</span>
                </label>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

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

      {Platform.OS === 'web' ? (
        <button onClick={addMedication} style={buttonStyle}>
          + Add Medication
        </button>
      ) : (
        <Pressable
          onPress={addMedication}
          className="px-4 py-2 bg-secondary-50 rounded-lg self-start"
        >
          <Text className="text-secondary-600 font-medium">+ Add Medication</Text>
        </Pressable>
      )}
    </View>
  );
}
