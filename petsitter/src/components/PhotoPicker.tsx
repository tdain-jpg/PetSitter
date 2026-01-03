import { View, Text, Image, Pressable, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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
      alert('Permission to access photos is required!');
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

  // Web-specific rendering
  if (Platform.OS === 'web') {
    return (
      <View className="mb-4">
        {label && (
          <Text className="text-gray-700 font-medium mb-2">{label}</Text>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            onClick={pickImage}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: value ? 'transparent' : '#f3f4f6',
              border: '2px dashed #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {value ? (
              <img
                src={value}
                alt="Pet photo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <span style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                Tap to add photo
              </span>
            )}
          </div>
          {value && (
            <button
              onClick={removePhoto}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Remove
            </button>
          )}
        </div>
      </View>
    );
  }

  return (
    <View className="mb-4">
      {label && (
        <Text className="text-gray-700 font-medium mb-2">{label}</Text>
      )}
      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={pickImage}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: value ? 'transparent' : '#f3f4f6',
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: '#d1d5db',
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
            <Text className="text-gray-400 text-sm text-center">
              Tap to{'\n'}add photo
            </Text>
          )}
        </Pressable>
        {value && (
          <Pressable
            onPress={removePhoto}
            className="px-4 py-2 bg-red-50 rounded-lg"
          >
            <Text className="text-red-600">Remove</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
