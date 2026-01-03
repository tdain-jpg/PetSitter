import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from '../lib/storage';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      await storage.seedTestUsers();
      const storedUser = await storage.getUser();
      setUser(storedUser);
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const storedUser = await storage.findUserByEmail(email);

    if (!storedUser) {
      throw new Error('No account found with this email');
    }

    if (storedUser.password !== password) {
      throw new Error('Incorrect password');
    }

    const newUser: User = {
      id: storedUser.id,
      email: storedUser.email,
      full_name: storedUser.full_name,
      role: storedUser.role || 'user',
      created_at: storedUser.created_at,
    };

    await storage.setUser(newUser);
    setUser(newUser);
  };

  const signUp = async (email: string, password: string) => {
    const existingUser = await storage.findUserByEmail(email);

    if (existingUser) {
      throw new Error('An account with this email already exists');
    }

    const now = new Date().toISOString();
    const newStoredUser = {
      id: crypto.randomUUID(),
      email,
      password,
      role: 'user' as const,
      created_at: now,
    };

    await storage.saveUserToDb(newStoredUser);

    const newUser: User = {
      id: newStoredUser.id,
      email: newStoredUser.email,
      role: newStoredUser.role,
      created_at: newStoredUser.created_at,
    };

    await storage.setUser(newUser);
    setUser(newUser);
  };

  const signOut = async () => {
    await storage.setUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
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
