import { useState } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { Input } from './Input';
import { generateId } from '../services';
import type { HealthProtocol, HealthSymptom } from '../types';
import { DEFAULT_HEALTH_SYMPTOMS } from '../types';

interface SymptomCheckerEditorProps {
  label?: string;
  value: HealthProtocol | undefined;
  onChange: (value: HealthProtocol) => void;
}

export function SymptomCheckerEditor({
  label,
  value,
  onChange,
}: SymptomCheckerEditorProps) {
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customSymptomName, setCustomSymptomName] = useState('');

  // Initialize with defaults if no value
  const protocol: HealthProtocol = value || {
    symptoms: DEFAULT_HEALTH_SYMPTOMS.map((s) => ({
      ...s,
      id: generateId(),
    })),
  };

  const toggleSymptom = (id: string) => {
    const updatedSymptoms = protocol.symptoms.map((s) =>
      s.id === id ? { ...s, is_enabled: !s.is_enabled } : s
    );
    onChange({ ...protocol, symptoms: updatedSymptoms });
  };

  const updateSymptomNotes = (id: string, notes: string) => {
    const updatedSymptoms = protocol.symptoms.map((s) =>
      s.id === id ? { ...s, notes: notes || undefined } : s
    );
    onChange({ ...protocol, symptoms: updatedSymptoms });
  };

  const removeCustomSymptom = (id: string) => {
    const updatedSymptoms = protocol.symptoms.filter((s) => s.id !== id);
    onChange({ ...protocol, symptoms: updatedSymptoms });
  };

  const addCustomSymptom = () => {
    if (!customSymptomName.trim()) return;

    const newSymptom: HealthSymptom = {
      id: generateId(),
      name: customSymptomName.trim(),
      is_enabled: true,
      is_custom: true,
    };

    onChange({
      ...protocol,
      symptoms: [...protocol.symptoms, newSymptom],
    });

    setCustomSymptomName('');
    setShowAddCustom(false);
  };

  const updateGeneralNotes = (notes: string) => {
    onChange({ ...protocol, general_notes: notes || undefined });
  };

  // Separate default and custom symptoms
  const defaultSymptoms = protocol.symptoms.filter((s) => !s.is_custom);
  const customSymptoms = protocol.symptoms.filter((s) => s.is_custom);

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-gray-700 font-medium mb-2">{label}</Text>
      )}

      <View className="bg-amber-50 p-3 rounded-lg mb-4 border border-amber-200">
        <Text className="text-amber-800 text-sm">
          Toggle symptoms that should alert the pet sitter to call the vet.
          Add notes for specific instructions.
        </Text>
      </View>

      {/* Default Symptoms */}
      <Text className="text-gray-600 font-medium mb-2 text-sm uppercase tracking-wide">
        Common Symptoms to Watch For
      </Text>

      {defaultSymptoms.map((symptom) => (
        <View
          key={symptom.id}
          className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100"
        >
          <View>
            <View className="flex-row items-center">
              <Switch
                value={symptom.is_enabled}
                onValueChange={() => toggleSymptom(symptom.id)}
              />
              <Text
                className={`ml-3 text-base ${
                  symptom.is_enabled ? 'text-gray-900' : 'text-gray-400 line-through'
                }`}
              >
                {symptom.name}
              </Text>
            </View>
            {symptom.is_enabled && (
              <View className="mt-2 ml-12">
                <Input
                  placeholder="Add notes (optional)"
                  value={symptom.notes || ''}
                  onChangeText={(notes) => updateSymptomNotes(symptom.id, notes)}
                />
              </View>
            )}
          </View>
        </View>
      ))}

      {/* Custom Symptoms */}
      {customSymptoms.length > 0 && (
        <>
          <Text className="text-gray-600 font-medium mb-2 mt-4 text-sm uppercase tracking-wide">
            Custom Symptoms
          </Text>

          {customSymptoms.map((symptom) => (
            <View
              key={symptom.id}
              className="bg-blue-50 rounded-lg p-3 mb-2 border border-blue-100"
            >
              <View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <Switch
                      value={symptom.is_enabled}
                      onValueChange={() => toggleSymptom(symptom.id)}
                    />
                    <Text
                      className={`ml-3 text-base ${
                        symptom.is_enabled ? 'text-gray-900' : 'text-gray-400 line-through'
                      }`}
                    >
                      {symptom.name}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removeCustomSymptom(symptom.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${symptom.name}`}
                    className="px-2 py-1 bg-red-50 rounded"
                  >
                    <Text className="text-red-600 text-xs">Remove</Text>
                  </Pressable>
                </View>
                {symptom.is_enabled && (
                  <View className="mt-2 ml-12">
                    <Input
                      placeholder="Add notes (optional)"
                      value={symptom.notes || ''}
                      onChangeText={(notes) => updateSymptomNotes(symptom.id, notes)}
                    />
                  </View>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {/* Add Custom Symptom */}
      {showAddCustom ? (
        <View className="bg-gray-100 rounded-lg p-4 mt-3">
          <Input
            label="Custom Symptom Name"
            placeholder="e.g., Excessive scratching"
            value={customSymptomName}
            onChangeText={setCustomSymptomName}
          />
          <View className="flex-row gap-2 mt-2">
            <Pressable
              onPress={addCustomSymptom}
              accessibilityRole="button"
              accessibilityLabel="Add symptom"
              className="px-4 py-2 bg-primary-600 rounded-lg"
            >
              <Text className="text-white font-medium">Add</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowAddCustom(false);
                setCustomSymptomName('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="px-4 py-2 bg-gray-200 rounded-lg"
            >
              <Text className="text-gray-700 font-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowAddCustom(true)}
          accessibilityRole="button"
          accessibilityLabel="Add custom symptom"
          className="px-4 py-2 bg-primary-50 rounded-lg self-start mt-3"
        >
          <Text className="text-primary-600 font-medium">+ Add Custom Symptom</Text>
        </Pressable>
      )}

      {/* General Notes */}
      <View className="mt-4">
        <Input
          label="General Health Notes"
          placeholder="Any additional health instructions for the sitter..."
          value={protocol.general_notes || ''}
          onChangeText={updateGeneralNotes}
          multiline
        />
      </View>
    </View>
  );
}
