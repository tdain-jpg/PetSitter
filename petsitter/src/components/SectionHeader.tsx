import { View, Text, Pressable, Platform } from 'react-native';
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

  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          backgroundColor: COLORS.cream,
          borderRadius: 12,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: `1px solid ${COLORS.creamDark}`,
          overflow: 'hidden',
        }}
      >
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 16,
            cursor: 'pointer',
            borderBottom: expanded ? `1px solid ${COLORS.creamDark}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                transition: 'transform 0.2s',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                color: COLORS.tanLight,
              }}
            >
              ›
            </span>
            {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
            <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.brown }}>
              {title}
            </span>
          </div>
          {rightAction && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                rightAction.onPress();
              }}
              style={{
                padding: '4px 12px',
                backgroundColor: COLORS.secondaryLight,
                color: COLORS.secondary,
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {rightAction.label}
            </button>
          )}
        </div>
        {expanded && (
          <div style={{ padding: 16 }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <View className="bg-cream-50 rounded-xl mb-4 shadow-sm border border-tan-200 overflow-hidden">
      <Pressable
        onPress={() => setExpanded(!expanded)}
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
