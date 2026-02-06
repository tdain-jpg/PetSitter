import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { COLORS } from '../constants';
import type { EmergencyContact } from '../types';

interface ContactCardProps {
  contact: EmergencyContact;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export function ContactCard({
  contact,
  onEdit,
  onDelete,
  readOnly = false,
}: ContactCardProps) {
  const handleCall = () => {
    Linking.openURL(`tel:${contact.phone}`);
  };

  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          backgroundColor: COLORS.creamDark,
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          border: `1px solid ${COLORS.tanMedium}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.brown }}>
                {contact.name}
              </span>
              {contact.is_primary && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    backgroundColor: COLORS.primaryLight,
                    color: COLORS.primary,
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  PRIMARY
                </span>
              )}
            </div>
            <span style={{ fontSize: 14, color: COLORS.tan, display: 'block' }}>
              {contact.relationship}
            </span>
            <a
              href={`tel:${contact.phone}`}
              style={{
                fontSize: 14,
                color: COLORS.secondary,
                textDecoration: 'none',
                display: 'block',
                marginTop: 4,
              }}
            >
              📞 {contact.phone}
            </a>
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                style={{
                  fontSize: 14,
                  color: COLORS.secondary,
                  textDecoration: 'none',
                  display: 'block',
                  marginTop: 2,
                }}
              >
                ✉️ {contact.email}
              </a>
            )}
            {contact.notes && (
              <span style={{ fontSize: 12, color: COLORS.tanLight, display: 'block', marginTop: 4 }}>
                {contact.notes}
              </span>
            )}
          </div>

          {!readOnly && (
            <div style={{ display: 'flex', gap: 4 }}>
              {onEdit && (
                <button
                  onClick={onEdit}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    color: COLORS.secondary,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    color: COLORS.accent,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <View className="bg-cream-200 rounded-lg p-3 mb-2 border border-tan-200">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-base font-semibold text-brown-800">
              {contact.name}
            </Text>
            {contact.is_primary && (
              <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                <Text className="text-primary-600 text-xs font-semibold">PRIMARY</Text>
              </View>
            )}
          </View>
          <Text className="text-tan-500">{contact.relationship}</Text>
          <Pressable onPress={handleCall}>
            <Text className="text-secondary-600 mt-1">📞 {contact.phone}</Text>
          </Pressable>
          {contact.email && (
            <Text className="text-secondary-600 text-sm">✉️ {contact.email}</Text>
          )}
          {contact.notes && (
            <Text className="text-tan-400 text-sm mt-1">{contact.notes}</Text>
          )}
        </View>

        {!readOnly && (
          <View className="flex-row gap-1">
            {onEdit && (
              <Pressable onPress={onEdit} className="px-2 py-1">
                <Text className="text-secondary-600 text-sm">Edit</Text>
              </Pressable>
            )}
            {onDelete && (
              <Pressable onPress={onDelete} className="px-2 py-1">
                <Text className="text-accent-600 text-sm">Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
