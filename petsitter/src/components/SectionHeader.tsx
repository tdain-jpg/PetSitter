import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../constants';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  icon?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

export function SectionHeader({
  title,
  icon,
  children,
  defaultExpanded = true,
  rightAction,
}: SectionHeaderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View className="bg-cream-50 rounded-xl mb-4 shadow-sm border border-tan-200 overflow-hidden">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={`${title} section`}
        accessibilityState={{ expanded }}
        className={`flex-row justify-between items-center p-4 ${
          expanded ? 'border-b border-tan-200' : ''
        }`}
      >
        <View className="flex-row items-center gap-2">
          <Text
            style={{
              transform: [{ rotate: expanded ? '90deg' : '0deg' }],
              color: COLORS.tanLight,
            }}
          >
            ›
          </Text>
          {icon && <Text style={{ fontSize: 18 }}>{icon}</Text>}
          <Text className="text-base font-semibold text-brown-800">{title}</Text>
        </View>
        {rightAction && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              rightAction.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={rightAction.label}
            className="bg-primary-50 px-3 py-1 rounded"
          >
            <Text className="text-primary-600 text-xs">{rightAction.label}</Text>
          </Pressable>
        )}
      </Pressable>
      {expanded && <View className="p-4">{children}</View>}
    </View>
  );
}
