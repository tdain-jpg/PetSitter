import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, PhotoPicker, ScreenContainer, ScreenHeader } from '../components';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { isValidPhoneNumber } from '../utils';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { MyProfile } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SitterProfile'>;

/**
 * The sitter's profile: what the households they look after see (0039).
 *
 * Owners knew their sitter only as an email address and had no way to call
 * them from the app. This is the sitter's own answer to that: their name,
 * the number to reach them on, an optional business name, and a photo, shown
 * to every household that has them as an accepted sitter and to no one else.
 *
 * The photo uses the same picker, cropper and storage as pet photos.
 */
export function SitterProfileScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MyProfile>({
    full_name: '',
    phone: '',
    business_name: '',
    photo_url: null,
  });

  useEffect(() => {
    let cancelled = false;
    dataService
      .getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile({ ...p, full_name: p.full_name ?? '', phone: p.phone ?? '', business_name: p.business_name ?? '' });
      })
      .catch((error) => {
        if (!cancelled) showAlert("Couldn't load your profile", friendlyError(error, 'Please try again.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const name = (profile.full_name ?? '').trim();
    const phone = (profile.phone ?? '').trim();
    if (!name) {
      showAlert('Add your name', 'Your clients see this instead of your email address.');
      return;
    }
    if (phone && !isValidPhoneNumber(phone)) {
      showAlert('Check your phone number', "That doesn't look like a phone number.");
      return;
    }
    setSaving(true);
    try {
      await dataService.saveMyProfile(profile);
      await showAlert('Saved', 'The households you look after will see these details.');
      navigation.goBack();
    } catch (error) {
      showAlert("Couldn't save", friendlyError(error, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Your sitter profile" width="form" />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <ScreenContainer variant="form" className="p-4">
          <Text className="text-tan-600 mb-4 leading-6">
            The households you look after see this, so they know who is coming and how to reach
            you. Nobody else does.
          </Text>

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              <Card className="mb-4 items-center">
                <PhotoPicker
                  label="Your photo"
                  value={profile.photo_url ?? undefined}
                  onChange={(url) => setProfile((prev) => ({ ...prev, photo_url: url ?? null }))}
                />
              </Card>

              <Card className="mb-4">
                <Input
                  label="Your name *"
                  placeholder="e.g., Amanda Smith"
                  value={profile.full_name ?? ''}
                  onChangeText={(v) => setProfile((prev) => ({ ...prev, full_name: v }))}
                  autoCapitalize="words"
                />
                <Input
                  label="Phone"
                  placeholder="(555) 123-4567"
                  value={profile.phone ?? ''}
                  onChangeText={(v) => setProfile((prev) => ({ ...prev, phone: v }))}
                  keyboardType="phone-pad"
                  formatAsPhone
                />
                <Input
                  label="Business name (optional)"
                  placeholder="e.g., Happy Paws Pet Sitting"
                  value={profile.business_name ?? ''}
                  onChangeText={(v) => setProfile((prev) => ({ ...prev, business_name: v }))}
                  autoCapitalize="words"
                />
              </Card>

              <View className="mb-10">
                <Button
                  title={saving ? 'Saving…' : 'Save profile'}
                  onPress={save}
                  disabled={saving}
                />
              </View>
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
