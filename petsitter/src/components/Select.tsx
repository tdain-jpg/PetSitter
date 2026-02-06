import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../constants';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  placeholder?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  error?: string;
}

export function Select({
  label,
  placeholder = 'Select an option',
  value,
  options,
  onValueChange,
  error,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optValue: string) => {
    onValueChange(optValue);
    setIsOpen(false);
  };

  // For web, use native select for better UX
  if (Platform.OS === 'web') {
    return (
      <View className="mb-4">
        {label && (
          <Text className="text-brown-600 font-medium mb-2">{label}</Text>
        )}
        <select
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: error ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
            fontSize: 16,
            backgroundColor: COLORS.cardBackground,
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23A08060'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '20px',
            color: COLORS.text,
          }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <Text className="text-accent-500 text-sm mt-1">{error}</Text>}
      </View>
    );
  }

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}
      <Pressable
        onPress={() => setIsOpen(true)}
        className={`
          border rounded-lg px-4 py-3 bg-cream-50 flex-row justify-between items-center
          ${error ? 'border-accent-500' : 'border-tan-300'}
        `}
      >
        <Text className={selectedOption ? 'text-brown-800' : 'text-tan-400'}>
          {selectedOption?.label || placeholder}
        </Text>
        <Text className="text-tan-400">▼</Text>
      </Pressable>
      {error && <Text className="text-accent-500 text-sm mt-1">{error}</Text>}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setIsOpen(false)}
        >
          <View className="bg-cream-50 rounded-xl w-4/5 max-h-96 overflow-hidden">
            <View className="p-4 border-b border-tan-200">
              <Text className="text-lg font-semibold text-brown-800">
                {label || 'Select Option'}
              </Text>
            </View>
            <ScrollView>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSelect(opt.value)}
                  className={`
                    p-4 border-b border-tan-100
                    ${opt.value === value ? 'bg-primary-50' : ''}
                  `}
                >
                  <Text
                    className={`text-base ${
                      opt.value === value
                        ? 'text-primary-600 font-medium'
                        : 'text-brown-600'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
