import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, ScreenContainer } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { isValidEmail } from '../utils';
import { COLORS } from '../constants';
import type { ForgotPasswordScreenProps } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');

export function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { requestPasswordReset } = useAuth();

  const handleSubmit = async () => {
    if (!email.trim() || !isValidEmail(email)) {
      setEmailError('Please enter a valid email');
      return;
    }
    setEmailError(undefined);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
    } catch (error) {
      // Deliberately swallowed: the success state must be identical whether or
      // not an account exists, so failures can't be used to enumerate accounts.
      console.error('Password reset request failed:', error);
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
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
                Enter your email and we'll send you a link to reset your password
              </Text>
            </View>

            {submitted ? (
              /* Success state — identical whether or not the account exists */
              <View className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <Text className="text-primary-700 text-center leading-6">
                  ✉️ If an account exists for that address, a reset link is on
                  its way. Check your inbox.
                </Text>
              </View>
            ) : (
              <>
                {/* Form */}
                <View className="mb-6">
                  <Input
                    label="Email"
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={emailError}
                  />
                </View>

                <Button
                  title="Send Reset Link"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                />
              </>
            )}

            {/* Back to Login */}
            <View className="flex-row justify-center mt-6">
              <Text className="text-tan-600">Remembered it? </Text>
              <Pressable
                onPress={() => navigation.navigate('Login')}
                accessibilityRole="link"
                accessibilityLabel="Back to sign in"
                hitSlop={12}
              >
                <Text className="text-primary-600 font-semibold">Back to Sign In</Text>
              </Pressable>
            </View>
          </ScreenContainer>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
