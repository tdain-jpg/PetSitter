import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Pet,
  Guide,
  TaskCompletion,
  ShareableLink,
  CheatSheet,
  AppSettings,
  OnboardingState,
} from '../types';
import {
  DataService,
  ExportedData,
  generateId,
  getCurrentTimestamp,
  generateShareCode,
} from './DataService';

/**
 * Storage keys used by the adapter
 */
const KEYS = {
  PETS: '@petsitter:pets',
  GUIDES: '@petsitter:guides',
  TASK_COMPLETIONS: '@petsitter:task_completions',
  SHARE_LINKS: '@petsitter:share_links',
  CHEAT_SHEETS: '@petsitter:cheat_sheets',
  SETTINGS: '@petsitter:settings',
  ONBOARDING: '@petsitter:onboarding',
} as const;

/**
 * Default app settings
 */
const DEFAULT_SETTINGS: Omit<AppSettings, 'user_id'> = {
  theme: 'system',
  notifications_enabled: true,
  auto_save_enabled: true,
  onboarding_completed: false,
};

/**
 * AsyncStorage implementation of DataService
 */
export class AsyncStorageAdapter implements DataService {
  // ============================================
  // Helper Methods
  // ============================================
  private async getArray<T>(key: string): Promise<T[]> {
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async setArray<T>(key: string, data: T[]): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  }

  // ============================================
  // Pet Operations
  // ============================================
  async getPets(userId: string): Promise<Pet[]> {
    const pets = await this.getArray<Pet>(KEYS.PETS);
    return pets.filter((p) => p.user_id === userId);
  }

  async getPet(petId: string): Promise<Pet | null> {
    const pets = await this.getArray<Pet>(KEYS.PETS);
    return pets.find((p) => p.id === petId) || null;
  }

  async createPet(pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>): Promise<Pet> {
    const pets = await this.getArray<Pet>(KEYS.PETS);
    const now = getCurrentTimestamp();
    const newPet: Pet = {
      ...pet,
      id: generateId(),
      created_at: now,
      updated_at: now,
    };
    pets.push(newPet);
    await this.setArray(KEYS.PETS, pets);
    return newPet;
  }

  async updatePet(petId: string, updates: Partial<Pet>): Promise<Pet> {
    const pets = await this.getArray<Pet>(KEYS.PETS);
    const index = pets.findIndex((p) => p.id === petId);
    if (index === -1) throw new Error('Pet not found');

    pets[index] = {
      ...pets[index],
      ...updates,
      updated_at: getCurrentTimestamp(),
    };
    await this.setArray(KEYS.PETS, pets);
    return pets[index];
  }

  async deletePet(petId: string): Promise<void> {
    const pets = await this.getArray<Pet>(KEYS.PETS);
    const filtered = pets.filter((p) => p.id !== petId);
    await this.setArray(KEYS.PETS, filtered);
  }

  async getActivePets(userId: string): Promise<Pet[]> {
    const pets = await this.getPets(userId);
    return pets.filter((p) => p.status === 'active');
  }

  async getDeceasedPets(userId: string): Promise<Pet[]> {
    const pets = await this.getPets(userId);
    return pets.filter((p) => p.status === 'deceased');
  }

  async markPetDeceased(petId: string, deceasedDate: string): Promise<Pet> {
    return this.updatePet(petId, { status: 'deceased', deceased_date: deceasedDate });
  }

  async restorePet(petId: string): Promise<Pet> {
    return this.updatePet(petId, { status: 'active', deceased_date: undefined });
  }

  // ============================================
  // Guide Operations
  // ============================================
  async getGuides(userId: string): Promise<Guide[]> {
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    return guides.filter((g) => g.user_id === userId);
  }

  async getGuide(guideId: string): Promise<Guide | null> {
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    return guides.find((g) => g.id === guideId) || null;
  }

  async createGuide(guide: Omit<Guide, 'id' | 'created_at' | 'updated_at'>): Promise<Guide> {
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    const now = getCurrentTimestamp();
    const newGuide: Guide = {
      ...guide,
      id: generateId(),
      created_at: now,
      updated_at: now,
    };
    guides.push(newGuide);
    await this.setArray(KEYS.GUIDES, guides);
    return newGuide;
  }

  async updateGuide(guideId: string, updates: Partial<Guide>): Promise<Guide> {
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    const index = guides.findIndex((g) => g.id === guideId);
    if (index === -1) throw new Error('Guide not found');

    guides[index] = {
      ...guides[index],
      ...updates,
      updated_at: getCurrentTimestamp(),
    };
    await this.setArray(KEYS.GUIDES, guides);
    return guides[index];
  }

  async deleteGuide(guideId: string): Promise<void> {
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    const filtered = guides.filter((g) => g.id !== guideId);
    await this.setArray(KEYS.GUIDES, filtered);

    // Also delete associated data
    await this.deleteCheatSheet(guideId);

    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    await this.setArray(
      KEYS.TASK_COMPLETIONS,
      completions.filter((c) => c.guide_id !== guideId)
    );

    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    await this.setArray(
      KEYS.SHARE_LINKS,
      links.filter((l) => l.guide_id !== guideId)
    );
  }

  async duplicateGuide(guideId: string): Promise<Guide> {
    const guide = await this.getGuide(guideId);
    if (!guide) throw new Error('Guide not found');

    const { id, created_at, updated_at, ...guideData } = guide;
    return this.createGuide({
      ...guideData,
      title: `${guide.title} (Copy)`,
    });
  }

  // ============================================
  // Task Completion Operations
  // ============================================
  async getTaskCompletions(guideId: string, date: string): Promise<TaskCompletion[]> {
    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    return completions.filter((c) => c.guide_id === guideId && c.date === date);
  }

  async markTaskComplete(
    completion: Omit<TaskCompletion, 'id'>
  ): Promise<TaskCompletion> {
    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);

    // Remove existing completion for this task/date if any
    const filtered = completions.filter(
      (c) => !(c.task_id === completion.task_id && c.date === completion.date)
    );

    const newCompletion: TaskCompletion = {
      ...completion,
      id: generateId(),
    };
    filtered.push(newCompletion);
    await this.setArray(KEYS.TASK_COMPLETIONS, filtered);
    return newCompletion;
  }

  async markTaskIncomplete(taskId: string, date: string): Promise<void> {
    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    const filtered = completions.filter(
      (c) => !(c.task_id === taskId && c.date === date)
    );
    await this.setArray(KEYS.TASK_COMPLETIONS, filtered);
  }

  async getCompletionHistory(guideId: string): Promise<TaskCompletion[]> {
    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    return completions.filter((c) => c.guide_id === guideId);
  }

  // ============================================
  // Share Operations
  // ============================================
  async createShareLink(
    guideId: string,
    userId: string,
    expiresInDays?: number
  ): Promise<ShareableLink> {
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);

    // Deactivate existing links for this guide
    links.forEach((link) => {
      if (link.guide_id === guideId) {
        link.is_active = false;
      }
    });

    const newLink: ShareableLink = {
      id: generateId(),
      guide_id: guideId,
      user_id: userId,
      code: generateShareCode(),
      expires_at: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      is_active: true,
      view_count: 0,
      created_at: getCurrentTimestamp(),
    };
    links.push(newLink);
    await this.setArray(KEYS.SHARE_LINKS, links);
    return newLink;
  }

  async getShareLink(code: string): Promise<ShareableLink | null> {
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    const link = links.find((l) => l.code === code);
    if (!link) return null;

    // Check if expired
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return null;
    }

    return link.is_active ? link : null;
  }

  async getShareLinks(userId: string): Promise<ShareableLink[]> {
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    return links.filter((l) => l.user_id === userId);
  }

  async deactivateShareLink(linkId: string): Promise<void> {
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    const index = links.findIndex((l) => l.id === linkId);
    if (index !== -1) {
      links[index].is_active = false;
      await this.setArray(KEYS.SHARE_LINKS, links);
    }
  }

  async incrementViewCount(linkId: string): Promise<void> {
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    const index = links.findIndex((l) => l.id === linkId);
    if (index !== -1) {
      links[index].view_count += 1;
      await this.setArray(KEYS.SHARE_LINKS, links);
    }
  }

  async getSharedGuide(code: string): Promise<Guide | null> {
    const link = await this.getShareLink(code);
    if (!link) return null;

    await this.incrementViewCount(link.id);
    return this.getGuide(link.guide_id);
  }

  async getSharedGuidePets(code: string): Promise<Pet[]> {
    const guide = await this.getSharedGuide(code);
    if (!guide) return [];

    const allPets = await this.getArray<Pet>(KEYS.PETS);
    return allPets.filter((p) => guide.pet_ids.includes(p.id));
  }

  // ============================================
  // AI Cheat Sheet Operations
  // ============================================
  async getCheatSheet(guideId: string): Promise<CheatSheet | null> {
    const sheets = await this.getArray<CheatSheet>(KEYS.CHEAT_SHEETS);
    return sheets.find((s) => s.guide_id === guideId) || null;
  }

  async saveCheatSheet(cheatSheet: Omit<CheatSheet, 'id'>): Promise<CheatSheet> {
    const sheets = await this.getArray<CheatSheet>(KEYS.CHEAT_SHEETS);

    // Remove existing cheat sheet for this guide
    const filtered = sheets.filter((s) => s.guide_id !== cheatSheet.guide_id);

    const newSheet: CheatSheet = {
      ...cheatSheet,
      id: generateId(),
    };
    filtered.push(newSheet);
    await this.setArray(KEYS.CHEAT_SHEETS, filtered);
    return newSheet;
  }

  async deleteCheatSheet(guideId: string): Promise<void> {
    const sheets = await this.getArray<CheatSheet>(KEYS.CHEAT_SHEETS);
    const filtered = sheets.filter((s) => s.guide_id !== guideId);
    await this.setArray(KEYS.CHEAT_SHEETS, filtered);
  }

  // ============================================
  // Settings Operations
  // ============================================
  async getSettings(userId: string): Promise<AppSettings> {
    const key = `${KEYS.SETTINGS}:${userId}`;
    try {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Fall through to default
    }

    // Return default settings
    return {
      ...DEFAULT_SETTINGS,
      user_id: userId,
    };
  }

  async updateSettings(
    userId: string,
    updates: Partial<AppSettings>
  ): Promise<AppSettings> {
    const current = await this.getSettings(userId);
    const updated: AppSettings = {
      ...current,
      ...updates,
      user_id: userId,
    };
    const key = `${KEYS.SETTINGS}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  }

  // ============================================
  // Onboarding Operations
  // ============================================
  async getOnboardingState(userId: string): Promise<OnboardingState | null> {
    const key = `${KEYS.ONBOARDING}:${userId}`;
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async updateOnboardingState(
    userId: string,
    state: Partial<OnboardingState>
  ): Promise<OnboardingState> {
    const current = await this.getOnboardingState(userId);
    const updated: OnboardingState = {
      current_step: 'welcome',
      completed_steps: [],
      ...current,
      ...state,
    };
    const key = `${KEYS.ONBOARDING}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  }

  async completeOnboarding(userId: string): Promise<void> {
    await this.updateSettings(userId, { onboarding_completed: true });
    const key = `${KEYS.ONBOARDING}:${userId}`;
    await AsyncStorage.removeItem(key);
  }

  // ============================================
  // Data Export/Import
  // ============================================
  async exportAllData(userId: string): Promise<ExportedData> {
    const [pets, guides, settings] = await Promise.all([
      this.getPets(userId),
      this.getGuides(userId),
      this.getSettings(userId),
    ]);

    // Get all task completions for user's guides
    const guideIds = guides.map((g) => g.id);
    const allCompletions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    const taskCompletions = allCompletions.filter((c) =>
      guideIds.includes(c.guide_id)
    );

    return {
      version: '1.0',
      exported_at: getCurrentTimestamp(),
      pets,
      guides,
      task_completions: taskCompletions,
      settings,
    };
  }

  async importData(userId: string, data: ExportedData): Promise<void> {
    // Import pets
    const existingPets = await this.getArray<Pet>(KEYS.PETS);
    const otherPets = existingPets.filter((p) => p.user_id !== userId);
    const importedPets = data.pets.map((p) => ({ ...p, user_id: userId }));
    await this.setArray(KEYS.PETS, [...otherPets, ...importedPets]);

    // Import guides
    const existingGuides = await this.getArray<Guide>(KEYS.GUIDES);
    const otherGuides = existingGuides.filter((g) => g.user_id !== userId);
    const importedGuides = data.guides.map((g) => ({ ...g, user_id: userId }));
    await this.setArray(KEYS.GUIDES, [...otherGuides, ...importedGuides]);

    // Import task completions
    const existingCompletions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    const guideIds = data.guides.map((g) => g.id);
    const otherCompletions = existingCompletions.filter(
      (c) => !guideIds.includes(c.guide_id)
    );
    await this.setArray(KEYS.TASK_COMPLETIONS, [
      ...otherCompletions,
      ...data.task_completions,
    ]);

    // Import settings
    await this.updateSettings(userId, data.settings);
  }

  async clearAllData(userId: string): Promise<void> {
    // Clear pets
    const pets = await this.getArray<Pet>(KEYS.PETS);
    await this.setArray(
      KEYS.PETS,
      pets.filter((p) => p.user_id !== userId)
    );

    // Clear guides
    const guides = await this.getArray<Guide>(KEYS.GUIDES);
    const userGuideIds = guides.filter((g) => g.user_id === userId).map((g) => g.id);
    await this.setArray(
      KEYS.GUIDES,
      guides.filter((g) => g.user_id !== userId)
    );

    // Clear task completions for user's guides
    const completions = await this.getArray<TaskCompletion>(KEYS.TASK_COMPLETIONS);
    await this.setArray(
      KEYS.TASK_COMPLETIONS,
      completions.filter((c) => !userGuideIds.includes(c.guide_id))
    );

    // Clear share links
    const links = await this.getArray<ShareableLink>(KEYS.SHARE_LINKS);
    await this.setArray(
      KEYS.SHARE_LINKS,
      links.filter((l) => l.user_id !== userId)
    );

    // Clear cheat sheets
    const sheets = await this.getArray<CheatSheet>(KEYS.CHEAT_SHEETS);
    await this.setArray(
      KEYS.CHEAT_SHEETS,
      sheets.filter((s) => !userGuideIds.includes(s.guide_id))
    );

    // Clear settings
    const key = `${KEYS.SETTINGS}:${userId}`;
    await AsyncStorage.removeItem(key);

    // Clear onboarding
    const onboardingKey = `${KEYS.ONBOARDING}:${userId}`;
    await AsyncStorage.removeItem(onboardingKey);
  }
}

// Export singleton instance
export const dataService = new AsyncStorageAdapter();
