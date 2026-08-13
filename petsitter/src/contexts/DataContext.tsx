import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { dataService } from '../services/SupabaseAdapter';
import { useAuth } from './AuthContext';
import type {
  Pet,
  Guide,
  AppSettings,
  TaskCompletion,
  ShareableLink,
  CheatSheet,
  OnboardingState,
} from '../types';
import type { ExportedData, SharedGuideBundle } from '../services/DataService';

interface DataContextType {
  // Pets
  pets: Pet[];
  activePets: Pet[];
  deceasedPets: Pet[];
  loadingPets: boolean;
  /** Set when the last pets load failed — lets screens distinguish "failed to load" from "no pets". */
  petsError: string | null;
  refreshPets: () => Promise<void>;
  createPet: (pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>) => Promise<Pet>;
  updatePet: (petId: string, updates: Partial<Pet>) => Promise<Pet>;
  deletePet: (petId: string) => Promise<void>;
  markPetDeceased: (petId: string, date: string) => Promise<Pet>;
  restorePet: (petId: string) => Promise<Pet>;

  // Guides
  guides: Guide[];
  loadingGuides: boolean;
  /** Set when the last guides load failed — lets screens distinguish "failed to load" from "no guides". */
  guidesError: string | null;
  refreshGuides: () => Promise<void>;
  getGuide: (guideId: string) => Promise<Guide | null>;
  createGuide: (guide: Omit<Guide, 'id' | 'created_at' | 'updated_at'>) => Promise<Guide>;
  updateGuide: (guideId: string, updates: Partial<Guide>) => Promise<Guide>;
  deleteGuide: (guideId: string) => Promise<void>;
  duplicateGuide: (guideId: string) => Promise<Guide>;

  // Task Completions
  getTaskCompletions: (guideId: string, date: string) => Promise<TaskCompletion[]>;
  markTaskComplete: (completion: Omit<TaskCompletion, 'id'>) => Promise<TaskCompletion>;
  markTaskIncomplete: (guideId: string, taskId: string, date: string) => Promise<void>;

  // Share Links
  createShareLink: (guideId: string, expiresInDays?: number) => Promise<ShareableLink>;
  getShareLinks: () => Promise<ShareableLink[]>;
  deactivateShareLink: (linkId: string) => Promise<void>;
  /** Resolves guide + pets in ONE resolve_share RPC call (one view_count increment). */
  getSharedGuideBundle: (code: string) => Promise<SharedGuideBundle | null>;
  getSharedGuide: (code: string) => Promise<Guide | null>;
  getSharedGuidePets: (code: string) => Promise<Pet[]>;

  // AI Cheat Sheets
  getCheatSheet: (guideId: string) => Promise<CheatSheet | null>;
  saveCheatSheet: (cheatSheet: Omit<CheatSheet, 'id'>) => Promise<CheatSheet>;

  // Settings
  settings: AppSettings | null;
  loadingSettings: boolean;
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>;

  // Onboarding
  onboardingState: OnboardingState | null;
  updateOnboardingState: (state: Partial<OnboardingState>) => Promise<OnboardingState>;
  completeOnboarding: () => Promise<void>;

  // Data Management
  exportAllData: () => Promise<ExportedData>;
  importData: (data: ExportedData) => Promise<void>;
  clearAllData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

interface DataProviderProps {
  children: ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const { user } = useAuth();
  const userId = user?.id;

  // Pets state
  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [petsError, setPetsError] = useState<string | null>(null);

  // Guides state
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [guidesError, setGuidesError] = useState<string | null>(null);

  // Stale-response guard: loads capture the userId they started with and bail
  // before setState if the signed-in user changed mid-flight (sign-out or
  // account switch), so a slow response can't repopulate another user's state.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Settings state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Onboarding state
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);

  // Derived state
  const activePets = pets.filter((p) => p.status === 'active');
  const deceasedPets = pets.filter((p) => p.status === 'deceased');

  // ============================================
  // Load Initial Data
  // ============================================
  useEffect(() => {
    if (userId) {
      refreshPets();
      refreshGuides();
      loadSettings();
      loadOnboardingState();
    } else {
      setPets([]);
      setGuides([]);
      setSettings(null);
      setOnboardingState(null);
      setPetsError(null);
      setGuidesError(null);
      setLoadingPets(false);
      setLoadingGuides(false);
      setLoadingSettings(false);
    }
  }, [userId]);

  // ============================================
  // Pet Operations
  // ============================================
  const refreshPets = useCallback(async () => {
    if (!userId) return;
    setLoadingPets(true);
    try {
      const data = await dataService.getPets(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setPets(data);
      setPetsError(null);
    } catch (err: any) {
      console.error('Failed to load pets:', err);
      if (userIdRef.current !== userId) return;
      setPetsError(err?.message || 'Failed to load pets');
    } finally {
      if (userIdRef.current === userId) setLoadingPets(false);
    }
  }, [userId]);

  const createPet = useCallback(
    async (pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>) => {
      const newPet = await dataService.createPet(pet);
      setPets((prev) => [...prev, newPet]);
      return newPet;
    },
    []
  );

  const updatePet = useCallback(async (petId: string, updates: Partial<Pet>) => {
    const updated = await dataService.updatePet(petId, updates);
    setPets((prev) => prev.map((p) => (p.id === petId ? updated : p)));
    return updated;
  }, []);

  const deletePet = useCallback(async (petId: string) => {
    await dataService.deletePet(petId);
    setPets((prev) => prev.filter((p) => p.id !== petId));
  }, []);

  const markPetDeceased = useCallback(async (petId: string, date: string) => {
    const updated = await dataService.markPetDeceased(petId, date);
    setPets((prev) => prev.map((p) => (p.id === petId ? updated : p)));
    return updated;
  }, []);

  const restorePet = useCallback(async (petId: string) => {
    const updated = await dataService.restorePet(petId);
    setPets((prev) => prev.map((p) => (p.id === petId ? updated : p)));
    return updated;
  }, []);

  // ============================================
  // Guide Operations
  // ============================================
  const refreshGuides = useCallback(async () => {
    if (!userId) return;
    setLoadingGuides(true);
    try {
      const data = await dataService.getGuides(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setGuides(data);
      setGuidesError(null);
    } catch (err: any) {
      console.error('Failed to load guides:', err);
      if (userIdRef.current !== userId) return;
      setGuidesError(err?.message || 'Failed to load guides');
    } finally {
      if (userIdRef.current === userId) setLoadingGuides(false);
    }
  }, [userId]);

  const getGuide = useCallback(async (guideId: string) => {
    return dataService.getGuide(guideId);
  }, []);

  const createGuide = useCallback(
    async (guide: Omit<Guide, 'id' | 'created_at' | 'updated_at'>) => {
      const newGuide = await dataService.createGuide(guide);
      setGuides((prev) => [...prev, newGuide]);
      return newGuide;
    },
    []
  );

  const updateGuide = useCallback(async (guideId: string, updates: Partial<Guide>) => {
    const updated = await dataService.updateGuide(guideId, updates);
    setGuides((prev) => prev.map((g) => (g.id === guideId ? updated : g)));
    return updated;
  }, []);

  const deleteGuide = useCallback(async (guideId: string) => {
    await dataService.deleteGuide(guideId);
    setGuides((prev) => prev.filter((g) => g.id !== guideId));
  }, []);

  const duplicateGuide = useCallback(async (guideId: string) => {
    const newGuide = await dataService.duplicateGuide(guideId);
    setGuides((prev) => [...prev, newGuide]);
    return newGuide;
  }, []);

  // ============================================
  // Task Completion Operations
  // ============================================
  const getTaskCompletions = useCallback(async (guideId: string, date: string) => {
    return dataService.getTaskCompletions(guideId, date);
  }, []);

  const markTaskComplete = useCallback(
    async (completion: Omit<TaskCompletion, 'id'>) => {
      return dataService.markTaskComplete(completion);
    },
    []
  );

  const markTaskIncomplete = useCallback(
    async (guideId: string, taskId: string, date: string) => {
      await dataService.markTaskIncomplete(guideId, taskId, date);
    },
    []
  );

  // ============================================
  // Share Link Operations
  // ============================================
  const createShareLink = useCallback(
    async (guideId: string, expiresInDays?: number) => {
      if (!userId) throw new Error('Not authenticated');
      return dataService.createShareLink(guideId, userId, expiresInDays);
    },
    [userId]
  );

  const getShareLinks = useCallback(async () => {
    if (!userId) return [];
    return dataService.getShareLinks(userId);
  }, [userId]);

  const deactivateShareLink = useCallback(async (linkId: string) => {
    await dataService.deactivateShareLink(linkId);
  }, []);

  const getSharedGuideBundle = useCallback(async (code: string) => {
    return dataService.getSharedGuideBundle(code);
  }, []);

  const getSharedGuide = useCallback(async (code: string) => {
    return dataService.getSharedGuide(code);
  }, []);

  const getSharedGuidePets = useCallback(async (code: string) => {
    return dataService.getSharedGuidePets(code);
  }, []);

  // ============================================
  // AI Cheat Sheet Operations
  // ============================================
  const getCheatSheet = useCallback(async (guideId: string) => {
    return dataService.getCheatSheet(guideId);
  }, []);

  const saveCheatSheet = useCallback(
    async (cheatSheet: Omit<CheatSheet, 'id'>) => {
      return dataService.saveCheatSheet(cheatSheet);
    },
    []
  );

  // ============================================
  // Settings Operations
  // ============================================
  const loadSettings = useCallback(async () => {
    if (!userId) return;
    setLoadingSettings(true);
    try {
      const data = await dataService.getSettings(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      if (userIdRef.current === userId) setLoadingSettings(false);
    }
  }, [userId]);

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      if (!userId) throw new Error('Not authenticated');
      const updated = await dataService.updateSettings(userId, updates);
      setSettings(updated);
      return updated;
    },
    [userId]
  );

  // ============================================
  // Onboarding Operations
  // ============================================
  const loadOnboardingState = useCallback(async () => {
    if (!userId) return;
    try {
      const state = await dataService.getOnboardingState(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setOnboardingState(state);
    } catch (err) {
      console.error('Failed to load onboarding state:', err);
    }
  }, [userId]);

  const updateOnboardingStateCallback = useCallback(
    async (state: Partial<OnboardingState>) => {
      if (!userId) throw new Error('Not authenticated');
      const updated = await dataService.updateOnboardingState(userId, state);
      setOnboardingState(updated);
      return updated;
    },
    [userId]
  );

  const completeOnboarding = useCallback(async () => {
    if (!userId) return;
    await dataService.completeOnboarding(userId);
    setOnboardingState(null);
    await loadSettings();
  }, [userId, loadSettings]);

  // ============================================
  // Data Management Operations
  // ============================================
  const exportAllData = useCallback(async () => {
    if (!userId) throw new Error('Not authenticated');
    return dataService.exportAllData(userId);
  }, [userId]);

  const importData = useCallback(
    async (data: ExportedData) => {
      if (!userId) throw new Error('Not authenticated');
      await dataService.importData(userId, data);
      // Refresh all data
      await Promise.all([refreshPets(), refreshGuides(), loadSettings()]);
    },
    [userId, refreshPets, refreshGuides, loadSettings]
  );

  const clearAllData = useCallback(async () => {
    if (!userId) throw new Error('Not authenticated');
    await dataService.clearAllData(userId);
    setPets([]);
    setGuides([]);
    await loadSettings();
  }, [userId, loadSettings]);

  const value: DataContextType = {
    // Pets
    pets,
    activePets,
    deceasedPets,
    loadingPets,
    petsError,
    refreshPets,
    createPet,
    updatePet,
    deletePet,
    markPetDeceased,
    restorePet,

    // Guides
    guides,
    loadingGuides,
    guidesError,
    refreshGuides,
    getGuide,
    createGuide,
    updateGuide,
    deleteGuide,
    duplicateGuide,

    // Task Completions
    getTaskCompletions,
    markTaskComplete,
    markTaskIncomplete,

    // Share Links
    createShareLink,
    getShareLinks,
    deactivateShareLink,
    getSharedGuideBundle,
    getSharedGuide,
    getSharedGuidePets,

    // AI Cheat Sheets
    getCheatSheet,
    saveCheatSheet,

    // Settings
    settings,
    loadingSettings,
    updateSettings,

    // Onboarding
    onboardingState,
    updateOnboardingState: updateOnboardingStateCallback,
    completeOnboarding,

    // Data Management
    exportAllData,
    importData,
    clearAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
