import { View, Text, Image, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../lib/showAlert';
import { COLORS } from '../constants';

interface PhotoPickerProps {
  label?: string;
  value?: string;
  onChange: (uri: string | undefined) => void;
  size?: number;
}

export function PhotoPicker({
  label,
  value,
  onChange,
  size = 120,
}: PhotoPickerProps) {
  const pickImage = async () => {
    // Request permission
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      showAlert('Permission required', 'Permission to access photos is required.');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onChange(result.assets[0].uri);
    }
  };

  const removePhoto = () => {
    onChange(undefined);
  };

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}
      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={pickImage}
          accessibilityRole="button"
          accessibilityLabel={value ? 'Change photo' : 'Add photo'}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: value ? 'transparent' : COLORS.cream,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: COLORS.borderDark,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {value ? (
            <Image
              source={{ uri: value }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text className="text-tan-500 text-sm text-center">
              Tap to{'\n'}add photo
            </Text>
          )}
        </Pressable>
        {value && (
          <Pressable
            onPress={removePhoto}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            className="px-4 py-2 bg-accent-50 rounded-lg"
          >
            <Text className="text-accent-600">Remove</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
