import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function sessionToUser(session: Session | null): User | null {
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email ?? '',
    full_name:
      (u.user_metadata?.full_name as string | undefined) ??
      (u.user_metadata?.name as string | undefined),
    avatar_url: u.user_metadata?.avatar_url as string | undefined,
    role: 'user',
    created_at: u.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Restore session on mount. A failed restore (e.g. corrupted AsyncStorage)
    // must still land on the signed-out UI — without the catch, isLoading
    // would stay true forever and the app would hang on the splash spinner.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setUser(sessionToUser(session));
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to restore session:', err);
        if (!mounted) return;
        setUser(null);
        setIsLoading(false);
      });

    // Subscribe to auth state changes (sign-in, sign-out, token refresh, OAuth callback)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(sessionToUser(session));
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
      },
    });
    if (error) throw new Error(error.message);
  };

  const signInWithGoogle = async () => {
    if (Platform.OS !== 'web') {
      // On native, signInWithOAuth resolves without error but performs no
      // redirect (it would require expo-auth-session), silently doing nothing.
      // Throw so callers surface the limitation instead of hanging.
      throw new Error('Google sign-in is not available in the mobile app yet. Please sign in with email and password.');
    }
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    // On web, this triggers a redirect.
  };

  const signInWithMagicLink = async (email: string) => {
    if (Platform.OS !== 'web') {
      // On native, the emailed link would open the web site in the phone's
      // browser and never sign the app itself in (no deep-link redirect +
      // session exchange exists yet). Throw so callers surface it.
      throw new Error('Magic link sign-in is not available in the mobile app yet. Please sign in with email and password.');
    }
    const emailRedirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithMagicLink,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
