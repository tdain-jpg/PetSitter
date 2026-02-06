import { View, Text, Pressable, Platform } from 'react-native';
import { COLORS } from '../constants';
import type { Guide, Pet } from '../types';

interface GuideCardProps {
  guide: Guide;
  pets: Pet[];
  onPress: () => void;
}

export function GuideCard({ guide, pets, onPress }: GuideCardProps) {
  const guidePets = pets.filter((p) => guide.pet_ids.includes(p.id));
  const petNames = guidePets.map((p) => p.name).join(', ') || 'No pets assigned';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dateRange =
    guide.start_date && guide.end_date
      ? `${formatDate(guide.start_date)} - ${formatDate(guide.end_date)}`
      : guide.start_date
      ? `From ${formatDate(guide.start_date)}`
      : null;

  // Web-specific rendering for better click handling
  if (Platform.OS === 'web') {
    return (
      <div
        onClick={onPress}
        style={{
          backgroundColor: COLORS.cream,
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: `1px solid ${COLORS.creamDark}`,
          cursor: 'pointer',
          transition: 'transform 0.1s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.01)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: COLORS.brown,
                display: 'block',
                marginBottom: 4,
              }}
            >
              {guide.title}
            </span>
            <span
              style={{
                fontSize: 14,
                color: COLORS.tan,
                display: 'block',
              }}
            >
              {petNames}
            </span>
            {dateRange && (
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.tanLight,
                  display: 'block',
                  marginTop: 4,
                }}
              >
                📅 {dateRange}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 20, color: COLORS.tanLight }}>›</span>
            {guide.emergency_contacts.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  backgroundColor: COLORS.secondaryLight,
                  color: COLORS.secondary,
                  borderRadius: 8,
                }}
              >
                {guide.emergency_contacts.length} contacts
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Native rendering
  return (
    <Pressable
      onPress={onPress}
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
            <Text className="text-tan-400 text-sm mt-1">📅 {dateRange}</Text>
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
