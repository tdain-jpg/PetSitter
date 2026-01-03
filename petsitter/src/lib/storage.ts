import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, UserRole } from '../types';

const STORAGE_KEYS = {
  USER: '@petsitter:user',
  USERS_DB: '@petsitter:users_db',
  SEEDED: '@petsitter:seeded',
} as const;

interface StoredUser {
  id: string;
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
  created_at: string;
}

// Test admin credentials
export const TEST_ADMIN = {
  email: 'admin@petsitter.local',
  password: 'admin123',
} as const;

export const storage = {
  async getUser(): Promise<User | null> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  },

  async setUser(user: User | null): Promise<void> {
    if (user) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }
  },

  async getUsersDb(): Promise<StoredUser[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USERS_DB);
    return data ? JSON.parse(data) : [];
  },

  async saveUserToDb(user: StoredUser): Promise<void> {
    const users = await this.getUsersDb();
    const existingIndex = users.findIndex((u) => u.email === user.email);
    if (existingIndex >= 0) {
      users[existingIndex] = user;
    } else {
      users.push(user);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(users));
  },

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const users = await this.getUsersDb();
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  },

  async seedTestUsers(): Promise<void> {
    const seeded = await AsyncStorage.getItem(STORAGE_KEYS.SEEDED);
    if (seeded) return;

    const adminUser: StoredUser = {
      id: 'admin-001',
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
      full_name: 'Admin User',
      role: 'admin',
      created_at: new Date().toISOString(),
    };

    await this.saveUserToDb(adminUser);
    await AsyncStorage.setItem(STORAGE_KEYS.SEEDED, 'true');
    console.log('Test admin user created:', TEST_ADMIN.email);
  },
};
