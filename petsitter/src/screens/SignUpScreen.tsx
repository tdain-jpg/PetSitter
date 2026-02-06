import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { isValidEmail } from '../utils';
import { COLORS } from '../constants';
import type { SignUpScreenProps } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');

export function SignUpScreen({ navigation }: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signUp } = useAuth();

  const validate = (): boolean => {
    const newErrors: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

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

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await signUp(email.trim(), password);
      // User is automatically logged in after signup
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message || 'An error occurred during sign up');
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
            <Text style={{ fontSize: 32, fontWeight: '800', color: COLORS.brown, letterSpacing: 1, textAlign: 'center' }}>
              Pet Sitter Pro
            </Text>
            <Text style={{ fontSize: 16, color: COLORS.primary, fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>
              Where Pets Rule the Kingdom!
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.tan, marginTop: 16, textAlign: 'center' }}>
              Create an account to get started
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
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
            />

            <Input
              label="Confirm Password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              error={errors.confirmPassword}
            />
          </View>

          {/* Sign Up Button */}
          <Button
            title="Create Account"
            onPress={handleSignUp}
            loading={isSubmitting}
            disabled={isSubmitting}
          />

          {/* Login Link */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-tan-600">Already have an account? </Text>
            <Text
              className="text-primary-600 font-semibold"
              onPress={() => navigation.navigate('Login')}
            >
              Sign In
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
