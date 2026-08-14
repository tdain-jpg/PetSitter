import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, ScreenContainer } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { showAlert } from '../lib/dialogs';
import { COLORS } from '../constants';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');

/**
 * Shown by RootNavigator while AuthContext.isPasswordRecovery is true —
 * i.e. the user just arrived from a password-recovery email link and already
 * holds a temporary session. Takes no route params.
 */
export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { updatePassword, clearPasswordRecovery } = useAuth();

  const validate = (): boolean => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      clearPasswordRecovery();
      await showAlert('Password updated', 'Your new password is saved and you are signed in.');
    } catch (error: any) {
      showAlert('Password update failed', error.message || 'Could not update your password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-2 pb-8 bg-cream-200">
          <ScreenContainer variant="form">
            {/* Logo */}
            <View className="items-center mb-2">
              <Image
                source={logo}
                style={{ width: 270, height: 270 }}
                resizeMode="contain"
              />
            </View>

            {/* Header */}
            <View className="mb-8 items-center">
              <Image
                source={wordmark}
                style={{ width: 250, height: 51 }}
                resizeMode="contain"
                accessibilityLabel="Pawstructions"
              />
              <Text style={{ fontSize: 16, color: COLORS.primary, fontStyle: 'italic', marginTop: 8, textAlign: 'center' }}>
                Where Pets Rule the Kingdom!
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.tan, marginTop: 16, textAlign: 'center' }}>
                Choose a new password for your account
              </Text>
            </View>

            {/* Form */}
            <View className="mb-6">
              <Input
                label="New Password"
                placeholder="Enter a new password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                error={errors.password}
              />

              <Input
                label="Confirm New Password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                error={errors.confirmPassword}
              />
            </View>

            <Button
              title="Update Password"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            />

            {/* Cancel path — keep the existing password and continue signed in */}
            <View className="items-center mt-6">
              <Pressable
                onPress={clearPasswordRecovery}
                accessibilityRole="button"
                accessibilityLabel="Keep current password and continue"
                hitSlop={12}
                disabled={isSubmitting}
              >
                <Text className="text-primary-600 font-semibold">Keep current password</Text>
              </Pressable>
            </View>
          </ScreenContainer>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
