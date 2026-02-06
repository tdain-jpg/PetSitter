import type {
  Pet,
  Guide,
  TaskCompletion,
  ShareableLink,
  CheatSheet,
  AppSettings,
  OnboardingState,
} from '../types';

/**
 * DataService Interface
 *
 * Abstraction layer for all data operations.
 * Currently implemented with AsyncStorage, but designed for easy migration to a backend.
 */
export interface DataService {
  // ============================================
  // Pet Operations
  // ============================================
  getPets(userId: string): Promise<Pet[]>;
  getPet(petId: string): Promise<Pet | null>;
  createPet(pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>): Promise<Pet>;
  updatePet(petId: string, updates: Partial<Pet>): Promise<Pet>;
  deletePet(petId: string): Promise<void>;
  getActivePets(userId: string): Promise<Pet[]>;
  getDeceasedPets(userId: string): Promise<Pet[]>;
  markPetDeceased(petId: string, deceasedDate: string): Promise<Pet>;
  restorePet(petId: string): Promise<Pet>;

  // ============================================
  // Guide Operations
  // ============================================
  getGuides(userId: string): Promise<Guide[]>;
  getGuide(guideId: string): Promise<Guide | null>;
  createGuide(guide: Omit<Guide, 'id' | 'created_at' | 'updated_at'>): Promise<Guide>;
  updateGuide(guideId: string, updates: Partial<Guide>): Promise<Guide>;
  deleteGuide(guideId: string): Promise<void>;
  duplicateGuide(guideId: string): Promise<Guide>;

  // ============================================
  // Task Completion Operations
  // ============================================
  getTaskCompletions(guideId: string, date: string): Promise<TaskCompletion[]>;
  markTaskComplete(completion: Omit<TaskCompletion, 'id'>): Promise<TaskCompletion>;
  markTaskIncomplete(taskId: string, date: string): Promise<void>;
  getCompletionHistory(guideId: string): Promise<TaskCompletion[]>;

  // ============================================
  // Share Operations
  // ============================================
  createShareLink(guideId: string, userId: string, expiresInDays?: number): Promise<ShareableLink>;
  getShareLink(code: string): Promise<ShareableLink | null>;
  getShareLinks(userId: string): Promise<ShareableLink[]>;
  deactivateShareLink(linkId: string): Promise<void>;
  incrementViewCount(linkId: string): Promise<void>;
  getSharedGuide(code: string): Promise<Guide | null>;
  getSharedGuidePets(code: string): Promise<Pet[]>;

  // ============================================
  // AI Cheat Sheet Operations
  // ============================================
  getCheatSheet(guideId: string): Promise<CheatSheet | null>;
  saveCheatSheet(cheatSheet: Omit<CheatSheet, 'id'>): Promise<CheatSheet>;
  deleteCheatSheet(guideId: string): Promise<void>;

  // ============================================
  // Settings Operations
  // ============================================
  getSettings(userId: string): Promise<AppSettings>;
  updateSettings(userId: string, updates: Partial<AppSettings>): Promise<AppSettings>;

  // ============================================
  // Onboarding Operations
  // ============================================
  getOnboardingState(userId: string): Promise<OnboardingState | null>;
  updateOnboardingState(userId: string, state: Partial<OnboardingState>): Promise<OnboardingState>;
  completeOnboarding(userId: string): Promise<void>;

  // ============================================
  // Data Export/Import
  // ============================================
  exportAllData(userId: string): Promise<ExportedData>;
  importData(userId: string, data: ExportedData): Promise<void>;
  clearAllData(userId: string): Promise<void>;
}

/**
 * Exported data structure for backup/restore
 */
export interface ExportedData {
  version: string;
  exported_at: string;
  pets: Pet[];
  guides: Guide[];
  task_completions: TaskCompletion[];
  settings: AppSettings;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generate a short share code
 */
export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
