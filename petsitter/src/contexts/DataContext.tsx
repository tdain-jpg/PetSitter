import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { dataService } from '../services/SupabaseAdapter';
import { useAuth } from './AuthContext';
import type {
  Pet,
  Guide,
  Household,
  HouseholdMember,
  HouseholdInviteRow,
  PendingInvite,
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

  // Households
  /** Every household the signed-in user belongs to (merged-view model). */
  households: Household[];
  householdsLoading: boolean;
  /** Set when the last households/invites load failed — lets screens distinguish "failed to load" from "no household". */
  householdsError: string | null;
  /** Pending invites addressed to ME (the signed-in user's confirmed email). */
  pendingInvites: PendingInvite[];
  /** Where new pets/guides land by default, or null if the user has no household. */
  primaryHouseholdId: string | null;
  refreshHouseholds: () => Promise<void>;
  inviteToHousehold: (householdId: string, email: string) => Promise<void>;
  respondToInvite: (inviteId: string, accept: boolean) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  leaveHousehold: (householdId: string) => Promise<void>;
  removeHouseholdMember: (householdId: string, memberUserId: string) => Promise<void>;
  renameHousehold: (householdId: string, name: string) => Promise<void>;
  getHouseholdMembers: (householdId: string) => Promise<HouseholdMember[]>;
  getHouseholdInvites: (householdId: string) => Promise<HouseholdInviteRow[]>;

  // Task Completions
  getTaskCompletions: (guideId: string, date: string) => Promise<TaskCompletion[]>;
  markTaskComplete: (completion: Omit<TaskCompletion, 'id'>) => Promise<TaskCompletion>;
  markTaskIncomplete: (guideId: string, taskId: string, date: string) => Promise<void>;

  // Share Links
  createShareLink: (guideId: string, expiresInDays?: number) => Promise<ShareableLink>;
  /**
   * All of a guide's links across the household (no user_id filter — RLS
   * scopes visibility). Housemates' live links MUST be visible here because
   * createShareLink deactivates every active link for the guide.
   */
  getShareLinksForGuide: (guideId: string) => Promise<ShareableLink[]>;
  deactivateShareLink: (linkId: string) => Promise<void>;
  /** Resolves guide + pets in ONE resolve_share RPC call (one view_count increment). */
  getSharedGuideBundle: (code: string) => Promise<SharedGuideBundle | null>;
  getSharedGuide: (code: string) => Promise<Guide | null>;
  getSharedGuidePets: (code: string) => Promise<Pet[]>;

  // AI Cheat Sheets (writes happen server-side in the generate-cheat-sheet
  // Edge Function; the client only reads)
  getCheatSheet: (guideId: string) => Promise<CheatSheet | null>;

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

  // Households state (merged-view model: user may belong to several)
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdsLoading, setHouseholdsLoading] = useState(true);
  const [householdsError, setHouseholdsError] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [primaryHouseholdId, setPrimaryHouseholdId] = useState<string | null>(null);

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

  // Derived state — memoized so the array identities only change when `pets`
  // does. Screens use these in effect/memo deps, so fresh identities on every
  // render would re-run those effects (and any auto-save they trigger) forever.
  const activePets = useMemo(() => pets.filter((p) => p.status === 'active'), [pets]);
  const deceasedPets = useMemo(() => pets.filter((p) => p.status === 'deceased'), [pets]);

  // ============================================
  // Load Initial Data
  // ============================================
  useEffect(() => {
    if (userId) {
      refreshPets();
      refreshGuides();
      refreshHouseholds();
      loadSettings();
      loadOnboardingState();
    } else {
      setPets([]);
      setGuides([]);
      setHouseholds([]);
      setPendingInvites([]);
      setPrimaryHouseholdId(null);
      setSettings(null);
      setOnboardingState(null);
      setPetsError(null);
      setGuidesError(null);
      setHouseholdsError(null);
      setLoadingPets(false);
      setLoadingGuides(false);
      setHouseholdsLoading(false);
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
  // Household Operations
  // ============================================
  const refreshHouseholds = useCallback(async () => {
    if (!userId) return;
    setHouseholdsLoading(true);
    try {
      const [myHouseholds, myInvites, primaryId] = await Promise.all([
        dataService.getMyHouseholds(),
        dataService.getMyPendingInvites(),
        dataService.getMyPrimaryHousehold(),
      ]);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setHouseholds(myHouseholds);
      setPendingInvites(myInvites);
      setPrimaryHouseholdId(primaryId);
      setHouseholdsError(null);
    } catch (err: any) {
      console.error('Failed to load households:', err);
      if (userIdRef.current !== userId) return;
      setHouseholdsError(err?.message || 'Failed to load households');
    } finally {
      if (userIdRef.current === userId) setHouseholdsLoading(false);
    }
  }, [userId]);

  // PWA-first sessions stay signed in for days, so invites sent while the app
  // was backgrounded would otherwise never appear until a full reload. On web
  // (react-native-web) AppState 'active' maps to the tab becoming visible.
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshHouseholds();
    });
    return () => subscription.remove();
  }, [userId, refreshHouseholds]);

  const inviteToHousehold = useCallback(async (householdId: string, email: string) => {
    // Server throws 'invalid email' / 'that email already belongs to a
    // household member' — let the message propagate to the UI as-is.
    await dataService.inviteToHousehold(householdId, email);
  }, []);

  const respondToInvite = useCallback(
    async (inviteId: string, accept: boolean) => {
      try {
        await dataService.respondToInvite(inviteId, accept);
      } catch (err) {
        // The RPC throws 'invite is not pending' / 'invite not found' when the
        // invite was revoked or answered elsewhere. Refresh anyway so the
        // stale banner disappears instead of failing identically on every
        // tap, then rethrow for the caller's alert. (refreshHouseholds
        // swallows its own errors, so it never masks the original one.)
        await refreshHouseholds();
        throw err;
      }
      // The pending-invites list changes either way (refreshHouseholds reloads
      // it). On ACCEPT the new household's pets/guides become visible, so
      // refresh those too — the merged view must show them immediately.
      if (accept) {
        await Promise.all([refreshHouseholds(), refreshPets(), refreshGuides()]);
      } else {
        await refreshHouseholds();
      }
    },
    [refreshHouseholds, refreshPets, refreshGuides]
  );

  const revokeInvite = useCallback(async (inviteId: string) => {
    await dataService.revokeInvite(inviteId);
  }, []);

  const leaveHousehold = useCallback(
    async (householdId: string) => {
      // Server throws 'cannot remove the last owner of a household' when
      // applicable. On success the household's pets/guides disappear from the
      // merged view, so refresh everything.
      await dataService.leaveHousehold(householdId);
      await Promise.all([refreshHouseholds(), refreshPets(), refreshGuides()]);
    },
    [refreshHouseholds, refreshPets, refreshGuides]
  );

  const removeHouseholdMember = useCallback(
    async (householdId: string, memberUserId: string) => {
      // Owner-only per RLS; same last-owner guard as leaveHousehold.
      await dataService.removeHouseholdMember(householdId, memberUserId);
    },
    []
  );

  const renameHousehold = useCallback(async (householdId: string, name: string) => {
    await dataService.renameHousehold(householdId, name);
    setHouseholds((prev) => prev.map((h) => (h.id === householdId ? { ...h, name } : h)));
  }, []);

  const getHouseholdMembers = useCallback(async (householdId: string) => {
    return dataService.getHouseholdMembers(householdId);
  }, []);

  const getHouseholdInvites = useCallback(async (householdId: string) => {
    return dataService.getHouseholdInvites(householdId);
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

  const getShareLinksForGuide = useCallback(async (guideId: string) => {
    return dataService.getShareLinksForGuide(guideId);
  }, []);

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
    // The wipe is scoped to the PRIMARY household — pets/guides in the user's
    // OTHER households survive server-side, so refetch server truth instead
    // of zeroing the merged view (zeroing would hide them until a full
    // reload, contradicting the Settings copy "Other households you've
    // joined are not affected"). Mirrors importData.
    await Promise.all([refreshPets(), refreshGuides(), loadSettings()]);
  }, [userId, refreshPets, refreshGuides, loadSettings]);

  // Memoized so consumers only re-render when something they can actually see
  // changes. Every value referenced below is listed in the dep array.
  const value = useMemo<DataContextType>(
    () => ({
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

      // Households
      households,
      householdsLoading,
      householdsError,
      pendingInvites,
      primaryHouseholdId,
      refreshHouseholds,
      inviteToHousehold,
      respondToInvite,
      revokeInvite,
      leaveHousehold,
      removeHouseholdMember,
      renameHousehold,
      getHouseholdMembers,
      getHouseholdInvites,

      // Task Completions
      getTaskCompletions,
      markTaskComplete,
      markTaskIncomplete,

      // Share Links
      createShareLink,
      getShareLinksForGuide,
      deactivateShareLink,
      getSharedGuideBundle,
      getSharedGuide,
      getSharedGuidePets,

      // AI Cheat Sheets
      getCheatSheet,

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
    }),
    [
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
      guides,
      loadingGuides,
      guidesError,
      refreshGuides,
      getGuide,
      createGuide,
      updateGuide,
      deleteGuide,
      duplicateGuide,
      households,
      householdsLoading,
      householdsError,
      pendingInvites,
      primaryHouseholdId,
      refreshHouseholds,
      inviteToHousehold,
      respondToInvite,
      revokeInvite,
      leaveHousehold,
      removeHouseholdMember,
      renameHousehold,
      getHouseholdMembers,
      getHouseholdInvites,
      getTaskCompletions,
      markTaskComplete,
      markTaskIncomplete,
      createShareLink,
      getShareLinksForGuide,
      deactivateShareLink,
      getSharedGuideBundle,
      getSharedGuide,
      getSharedGuidePets,
      getCheatSheet,
      settings,
      loadingSettings,
      updateSettings,
      onboardingState,
      updateOnboardingStateCallback,
      completeOnboarding,
      exportAllData,
      importData,
      clearAllData,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
