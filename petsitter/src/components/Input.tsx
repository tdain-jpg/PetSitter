import { TextInput, View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../constants';
import { formatPhoneNumber } from '../utils';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  multiline?: boolean;
  numberOfLines?: number;
  formatAsPhone?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  error,
  multiline = false,
  numberOfLines = 1,
  formatAsPhone = false,
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Handle phone number formatting
  const handleTextChange = (text: string) => {
    if (formatAsPhone) {
      const formatted = formatPhoneNumber(text);
      onChangeText(formatted);
    } else {
      onChangeText(text);
    }
  };

  // Display value (already formatted if phone)
  const displayValue = value;

  const inputStyles = `
    border rounded-lg px-4 py-3 text-base bg-cream-50
    ${isFocused ? 'border-primary-500' : 'border-tan-300'}
    ${error ? 'border-accent-500' : ''}
    ${multiline ? 'min-h-[100px] text-start' : ''}
    ${secureTextEntry ? 'pr-12' : ''}
  `;

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}
      <View className="relative">
        <TextInput
          className={inputStyles}
          placeholder={placeholder}
          placeholderTextColor={COLORS.tan}
          accessibilityLabel={label || placeholder}
          accessibilityHint={error}
          value={displayValue}
          onChangeText={handleTextChange}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          keyboardType={formatAsPhone ? 'phone-pad' : keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxLength={formatAsPhone ? 14 : undefined}
        />
        {secureTextEntry && (
          <Pressable
            onPress={togglePasswordVisibility}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-0 bottom-0 justify-center"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-lg">{isPasswordVisible ? '🙈' : '👁️'}</Text>
          </Pressable>
        )}
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" className="text-accent-500 text-sm mt-1">
          {error}
        </Text>
      )}
    </View>
  );
}
