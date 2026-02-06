import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { isValidEmail } from '../utils';
import { COLORS } from '../constants';
import type { LoginScreenProps } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');

export function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn } = useAuth();

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
      Alert.alert('Login Failed', error.message || 'An error occurred during login');
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
          </View>

          {/* Login Button */}
          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isSubmitting}
            disabled={isSubmitting}
          />

          {/* Sign Up Link */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-tan-600">Don't have an account? </Text>
            <Text
              className="text-primary-600 font-semibold"
              onPress={() => navigation.navigate('SignUp')}
            >
              Sign Up
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
