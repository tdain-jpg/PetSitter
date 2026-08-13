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
  markTaskIncomplete(guideId: string, taskId: string, date: string): Promise<void>;
  getCompletionHistory(guideId: string): Promise<TaskCompletion[]>;

  // ============================================
  // Share Operations
  // ============================================
  createShareLink(guideId: string, userId: string, expiresInDays?: number): Promise<ShareableLink>;
  getShareLink(code: string): Promise<ShareableLink | null>;
  getShareLinks(userId: string): Promise<ShareableLink[]>;
  deactivateShareLink(linkId: string): Promise<void>;
  incrementViewCount(linkId: string): Promise<void>;
  /**
   * Resolve a share code with ONE resolve_share RPC call, returning guide and
   * pets together. Prefer this over getSharedGuide/getSharedGuidePets — each
   * of those makes its own RPC call, and the RPC increments view_count per
   * invocation.
   */
  getSharedGuideBundle(code: string): Promise<SharedGuideBundle | null>;
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
 * A shared guide resolved from a share code (single RPC round trip).
 */
export interface SharedGuideBundle {
  guide: Guide;
  pets: Pet[];
}

/**
 * Exported data structure for backup/restore.
 * share_links and cheat_sheets are optional so backups written before
 * version 1.1 still import.
 */
export interface ExportedData {
  version: string;
  exported_at: string;
  pets: Pet[];
  guides: Guide[];
  task_completions: TaskCompletion[];
  share_links?: ShareableLink[];
  cheat_sheets?: CheatSheet[];
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
 * Generate a short share code.
 *
 * Entropy note: the code is the ONLY secret protecting a shared guide (which
 * includes the home address and door/alarm codes), so it must come from a
 * CSPRNG — Math.random() is predictable (its internal state is recoverable
 * from a few outputs). 12 chars over this 55-char alphabet is ~69 bits of
 * entropy, far beyond practical enumeration of the public resolve RPC. The
 * slight modulo bias per character is negligible at this length.
 *
 * Platform note: Hermes (iOS/Android) ships no global `crypto` and this
 * project bundles no polyfill, so on native we throw a clear error instead of
 * silently falling back to Math.random — a predictable fallback would defeat
 * the CSPRNG requirement above. Callers surface the message to the user
 * (ShareGuideScreen shows error.message in an alert).
 */
export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.getRandomValues !== 'function') {
    throw new Error(
      'Secure share codes are not available on this device. Please create the share link from the web app instead.'
    );
  }
  const bytes = new Uint8Array(12);
  cryptoObj.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < bytes.length; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}
