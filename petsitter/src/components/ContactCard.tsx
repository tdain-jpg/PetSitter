import { View, Text, Pressable, Linking } from 'react-native';
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
          <Pressable
            onPress={handleCall}
            accessibilityRole="button"
            accessibilityLabel={`Call ${contact.name} at ${contact.phone}`}
          >
            <Text className="text-secondary-600 mt-1">📞 {contact.phone}</Text>
          </Pressable>
          {contact.email && (
            <Text className="text-secondary-600 text-sm">✉️ {contact.email}</Text>
          )}
          {contact.notes && (
            <Text className="text-tan-500 text-sm mt-1">{contact.notes}</Text>
          )}
        </View>

        {!readOnly && (
          <View className="flex-row gap-1">
            {onEdit && (
              <Pressable
                onPress={onEdit}
                accessibilityRole="button"
                accessibilityLabel={`Edit contact ${contact.name}`}
                className="px-3 py-2.5 justify-center"
                style={{ minHeight: 44 }}
              >
                <Text className="text-secondary-600 text-sm">Edit</Text>
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={`Delete contact ${contact.name}`}
                className="px-3 py-2.5 justify-center"
                style={{ minHeight: 44 }}
              >
                <Text className="text-accent-600 text-sm">Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
