import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, ScreenContainer } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { isValidEmail } from '../utils';
import { showAlert } from '../lib/showAlert';
import { COLORS } from '../constants';
import type { LoginScreenProps } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');

export function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn, signInWithGoogle, signInWithMagicLink } = useAuth();
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (error: any) {
      showAlert('Login Failed', error.message || 'An error occurred during login');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      // Web: redirects away. Native: AuthContext throws (surfaced below).
    } catch (error: any) {
      showAlert('Google Sign-In Failed', error.message || 'Could not sign in with Google');
    } finally {
      // Always re-enable the form — without this, a resolved-but-not-redirected
      // sign-in would leave every button on the screen disabled.
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim() || !isValidEmail(email)) {
      setErrors({ email: 'Enter a valid email to receive a magic link' });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithMagicLink(email.trim());
      setMagicLinkSent(true);
    } catch (error: any) {
      showAlert('Magic Link Failed', error.message || 'Could not send magic link');
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
                Sign in to manage your pet care guides
              </Text>
            </View>

            {/* Form */}
            <View className="mb-6">
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
              />

              <Input
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                error={errors.password}
              />

              {/* Forgot password */}
              <Pressable
                onPress={() => navigation.navigate('ForgotPassword')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                hitSlop={12}
                className="self-end"
              >
                <Text className="text-primary-600 text-sm">Forgot password?</Text>
              </Pressable>
            </View>

            {/* Login Button */}
            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={isSubmitting}
              disabled={isSubmitting}
            />

            {/* Magic link confirmation */}
            {magicLinkSent && (
              <View className="mt-4 bg-primary-50 border border-primary-200 rounded-lg p-3">
                <Text className="text-primary-700 text-sm text-center">
                  ✉️ Check your inbox for a sign-in link.
                </Text>
              </View>
            )}

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-tan-300" />
              <Text className="mx-3 text-tan-500 text-sm">or</Text>
              <View className="flex-1 h-px bg-tan-300" />
            </View>

            {/* Google Sign-In */}
            <Button
              title="Continue with Google"
              onPress={handleGoogle}
              variant="outline"
              disabled={isSubmitting}
            />

            {/* Magic Link */}
            <View className="mt-3">
              <Button
                title="Email me a magic link"
                onPress={handleMagicLink}
                variant="secondary"
                disabled={isSubmitting}
              />
            </View>

            {/* Sign Up Link */}
            <View className="flex-row justify-center mt-6">
              <Text className="text-tan-600">Don't have an account? </Text>
              <Pressable
                onPress={() => navigation.navigate('SignUp')}
                accessibilityRole="link"
                accessibilityLabel="Sign up for a new account"
                hitSlop={12}
              >
                <Text className="text-primary-600 font-semibold">Sign Up</Text>
              </Pressable>
            </View>
          </ScreenContainer>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
