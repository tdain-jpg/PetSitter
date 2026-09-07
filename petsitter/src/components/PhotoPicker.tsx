import { useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../lib/showAlert';
import { uploadPetPhoto } from '../lib/petPhotos';
import { resizeForUpload } from '../lib/resizeImage';
import { PhotoCropper } from './PhotoCropper';
import { Platform } from 'react-native';
import { COLORS } from '../constants';
import { friendlyError } from '../lib/errors';

interface PhotoPickerProps {
  label?: string;
  /** The persisted photo URL (a permanent public storage URL). */
  value?: string;
  /**
   * Called with the PERMANENT public URL after a successful upload, or
   * undefined on remove. Never called with a transient blob:/file: uri.
   */
  onChange: (uri: string | undefined) => void;
  size?: number;
}

export function PhotoPicker({
  label,
  value,
  onChange,
  size = 120,
}: PhotoPickerProps) {
  const [uploading, setUploading] = useState(false);
  // Local picker uri shown as an instant preview while the upload runs.
  // Only ever non-null during an upload; the persisted value stays the
  // public URL emitted through onChange.
  const [pendingUri, setPendingUri] = useState<string | undefined>(undefined);
  // Set only on web, between picking and uploading, while the cropper is open.
  // Native never uses it: expo-image-picker's allowsEditing already gave the
  // user a real native cropper before we got here.
  const [cropping, setCropping] = useState<string | undefined>(undefined);

  const pickImage = async () => {
    if (uploading) return;

    // Request permission
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      showAlert('Permission required', 'Permission to access photos is required.');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      // MediaTypeOptions was deprecated in SDK 51 and is slated for removal;
      // MediaType is the replacement and takes an array.
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const localUri = asset.uri;

    // Show the picked image immediately, then upload it for real. Only the
    // permanent public URL is ever emitted — persisting the transient
    // blob:/file: uri is exactly the bug this component used to have.
    // The asset's mimeType rides along because the upload body is an
    // ArrayBuffer, which has no type of its own.
    // Web has no picker-provided editor, so a landscape photo would be
    // centre-cropped by CSS at display time and a pet standing off to one side
    // would lose its head. Offer the crop first; upload is what happens after.
    if (Platform.OS === 'web') {
      setCropping(localUri);
      return;
    }

    await uploadPicked(localUri, asset.mimeType);
  };

  const uploadPicked = async (localUri: string, mimeType?: string) => {
    setPendingUri(localUri);
    setUploading(true);
    try {
      // Resize BEFORE uploading. The picker's `quality` re-encodes but never
      // changes dimensions, so a phone photo stayed 3-8 MB and the bucket's
      // 5 MB cap rejected it — a failure the user could do nothing about,
      // since they don't control what their camera writes.
      const resized = await resizeForUpload(localUri);
      const publicUrl = await uploadPetPhoto(
        resized.uri,
        // A resized image is re-encoded as JPEG, so the picker's original
        // mimeType would be a lie (and the upload body is an ArrayBuffer with
        // no type of its own). Untouched images keep theirs.
        resized.untouched ? mimeType : 'image/jpeg'
      );
      onChange(publicUrl);
    } catch (error: any) {
      // Keep the previous value: onChange is not called on failure.
      showAlert(
        'Upload failed',
        friendlyError(error, 'Could not upload the photo. Please try again.')
      );
    } finally {
      setPendingUri(undefined);
      setUploading(false);
    }
  };

  const removePhoto = () => {
    if (uploading) return;
    // Deliberately NO storage deletion here: the removal is not persisted
    // until the parent form saves photo_url, so deleting eagerly would leave
    // the DB pointing at a 404 if that save never runs (app closed inside
    // the autosave debounce, empty-name guard, save failure). A stranded
    // object is harmless (see petPhotos.ts) — the replace-photo path leaves
    // the old object behind for the same reason.
    onChange(undefined);
  };

  const displayUri = pendingUri ?? value;

  return (
    <View className="mb-4">
      {cropping ? (
        <PhotoCropper
          uri={cropping}
          onCancel={() => setCropping(undefined)}
          onCropped={(croppedUri) => {
            setCropping(undefined);
            // Crop first, then resize — cropping a 12MP original and shrinking
            // the result keeps more detail than shrinking then cropping, and
            // resizeForUpload is what guarantees the bucket accepts it.
            void uploadPicked(croppedUri, 'image/jpeg');
          }}
        />
      ) : null}
      {label && (
        <Text className="text-brown-600 font-medium mb-2">{label}</Text>
      )}
      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={pickImage}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={displayUri ? 'Change photo' : 'Add photo'}
          accessibilityState={{ disabled: uploading, busy: uploading }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: displayUri ? 'transparent' : COLORS.cream,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: COLORS.borderDark,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text className="text-tan-500 text-sm text-center">
              Tap to{'\n'}add photo
            </Text>
          )}
          {uploading && (
            <View
              accessibilityLabel="Uploading photo"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(254, 253, 249, 0.7)', // creamLight @ 70%
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator size="small" color={COLORS.secondary} />
            </View>
          )}
        </Pressable>
        {value && !uploading && (
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
