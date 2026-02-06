import { useState } from 'react';
import { View, Text, Pressable, Platform, Switch } from 'react-native';
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

  const buttonStyle = Platform.OS === 'web'
    ? {
        padding: '8px 16px',
        backgroundColor: '#eff6ff',
        color: '#2563eb',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
      }
    : undefined;

  const removeButtonStyle = Platform.OS === 'web'
    ? {
        padding: '4px 8px',
        backgroundColor: '#fee2e2',
        color: '#dc2626',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
      }
    : undefined;

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
          {Platform.OS === 'web' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={symptom.is_enabled}
                  onChange={() => toggleSymptom(symptom.id)}
                  style={{ marginRight: 12, width: 18, height: 18 }}
                />
                <span style={{
                  fontSize: 15,
                  color: symptom.is_enabled ? '#111827' : '#9ca3af',
                  textDecoration: symptom.is_enabled ? 'none' : 'line-through',
                }}>
                  {symptom.name}
                </span>
              </label>
              {symptom.is_enabled && (
                <input
                  type="text"
                  value={symptom.notes || ''}
                  onChange={(e) => updateSymptomNotes(symptom.id, e.target.value)}
                  placeholder="Add notes (optional)"
                  style={{
                    marginLeft: 30,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    fontSize: 14,
                    backgroundColor: 'white',
                  }}
                />
              )}
            </div>
          ) : (
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
          )}
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
              {Platform.OS === 'web' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={symptom.is_enabled}
                        onChange={() => toggleSymptom(symptom.id)}
                        style={{ marginRight: 12, width: 18, height: 18 }}
                      />
                      <span style={{
                        fontSize: 15,
                        color: symptom.is_enabled ? '#111827' : '#9ca3af',
                        textDecoration: symptom.is_enabled ? 'none' : 'line-through',
                      }}>
                        {symptom.name}
                      </span>
                    </label>
                    <button
                      onClick={() => removeCustomSymptom(symptom.id)}
                      style={removeButtonStyle}
                    >
                      Remove
                    </button>
                  </div>
                  {symptom.is_enabled && (
                    <input
                      type="text"
                      value={symptom.notes || ''}
                      onChange={(e) => updateSymptomNotes(symptom.id, e.target.value)}
                      placeholder="Add notes (optional)"
                      style={{
                        marginLeft: 30,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #e5e7eb',
                        fontSize: 14,
                        backgroundColor: 'white',
                      }}
                    />
                  )}
                </div>
              ) : (
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
              )}
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
          {Platform.OS === 'web' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={addCustomSymptom}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#2563eb',
                  color: 'white',
                }}
              >
                Add Symptom
              </button>
              <button
                onClick={() => {
                  setShowAddCustom(false);
                  setCustomSymptomName('');
                }}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <View className="flex-row gap-2 mt-2">
              <Pressable
                onPress={addCustomSymptom}
                className="px-4 py-2 bg-primary-600 rounded-lg"
              >
                <Text className="text-white font-medium">Add</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowAddCustom(false);
                  setCustomSymptomName('');
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg"
              >
                <Text className="text-gray-700 font-medium">Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        Platform.OS === 'web' ? (
          <button
            onClick={() => setShowAddCustom(true)}
            style={{ ...buttonStyle, marginTop: 12 }}
          >
            + Add Custom Symptom
          </button>
        ) : (
          <Pressable
            onPress={() => setShowAddCustom(true)}
            className="px-4 py-2 bg-primary-50 rounded-lg self-start mt-3"
          >
            <Text className="text-primary-600 font-medium">+ Add Custom Symptom</Text>
          </Pressable>
        )
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
