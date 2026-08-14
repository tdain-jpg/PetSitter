import { View, Text, Pressable } from 'react-native';
import { formatDate as formatLocalDate } from '../lib/dates';
import type { Guide, Pet } from '../types';

interface GuideCardProps {
  guide: Guide;
  pets: Pet[];
  onPress: () => void;
}

export function GuideCard({ guide, pets, onPress }: GuideCardProps) {
  const guidePets = pets.filter((p) => guide.pet_ids.includes(p.id));
  const petNames = guidePets.map((p) => p.name).join(', ') || 'No pets assigned';

  // Shared local-date helper: new Date('YYYY-MM-DD') parses as UTC midnight
  // and rendered the PREVIOUS day west of UTC (QA saw Aug 20 listed as Aug 19).
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return formatLocalDate(dateStr, { month: 'short', day: 'numeric' }) || null;
  };

  const dateRange =
    guide.start_date && guide.end_date
      ? `${formatDate(guide.start_date)} - ${formatDate(guide.end_date)}`
      : guide.start_date
      ? `From ${formatDate(guide.start_date)}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Guide: ${guide.title}, for ${petNames}`}
      className="bg-cream-50 rounded-xl p-4 mb-3 shadow-sm border border-tan-200"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-brown-800 mb-1">
            {guide.title}
          </Text>
          <Text className="text-tan-500">{petNames}</Text>
          {dateRange && (
            <Text className="text-tan-500 text-sm mt-1">📅 {dateRange}</Text>
          )}
        </View>

        <View className="items-end gap-1">
          <Text className="text-2xl text-tan-300">›</Text>
          {guide.emergency_contacts.length > 0 && (
            <View className="bg-primary-50 px-2 py-0.5 rounded-full">
              <Text className="text-primary-600 text-xs">
                {guide.emergency_contacts.length} contacts
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
