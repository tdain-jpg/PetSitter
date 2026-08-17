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
import { confirmSessionLost } from '../lib/sessionExpired';
import { SessionExpiredNotice } from '../components/SessionExpiredNotice';
import type {
  Pet,
  Guide,
  Household,
  HouseholdMember,
  HouseholdInviteRow,
  PendingInvite,
  SitterConnection,
  PendingSitterInvite,
  Checkin,
  CrownReceipt,
  SitterInviteRow,
  AppSettings,
  JourneyEntry,
  TaskCompletion,
  ShareableLink,
  CheatSheet,
  OnboardingState,
} from '../types';
import type { ExportedData, SharedGuideBundle } from '../services/DataService';
import { JOURNEYS, getActiveJourney } from '../lib/journeys';

// How long the journey member count stays fresh before a passive households
// refresh may refetch it (see the lazy effect in the provider).
const MEMBER_COUNT_STALE_MS = 2 * 60 * 1000;

interface DataContextType {
  // Pets
  pets: Pet[];
  activePets: Pet[];
  deceasedPets: Pet[];
  loadingPets: boolean;
  /** Set when the last pets load failed — lets screens distinguish "failed to load" from "no pets". */
  petsError: string | null;
  refreshPets: (opts?: { background?: boolean }) => Promise<void>;
  createPet: (pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>) => Promise<Pet>;
  updatePet: (petId: string, updates: Partial<Pet>) => Promise<Pet>;
  deletePet: (petId: string) => Promise<void>;
  markPetDeceased: (petId: string, date: string) => Promise<Pet>;
  restorePet: (petId: string) => Promise<Pet>;
  /**
   * One pet by id, straight from the server. `pets` holds only the caller's OWN
   * households (see SupabaseAdapter.getPets), so a connected sitter looking at
   * a client's animal will never find it there — this is how those screens
   * resolve it. RLS still decides: a stranger gets null, not a row.
   */
  getPet: (petId: string) => Promise<Pet | null>;

  // Guides
  guides: Guide[];
  loadingGuides: boolean;
  /** Set when the last guides load failed — lets screens distinguish "failed to load" from "no guides". */
  guidesError: string | null;
  refreshGuides: (opts?: { background?: boolean }) => Promise<void>;
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
  /**
   * Pick the default household explicitly (settings.primary_household_id),
   * then re-read `primaryHouseholdId` from the my_primary_household RPC —
   * server truth, since the RPC re-validates membership — and refresh the
   * household list. REJECTS if the pointer did not take, so the caller can
   * surface a real error rather than a spinner that stops with nothing
   * changed. A server that DECLINED the pointer gets the PREVIOUS choice put
   * back first, so a refused change never costs the user the default they
   * already had. A failed re-read does not: the write itself very likely
   * landed, so it rejects with copy that claims only that we could not
   * confirm.
   */
  setPrimaryHousehold: (householdId: string) => Promise<void>;
  refreshHouseholds: () => Promise<void>;

  // Sitter connections (0015). A sitter is NOT a household member: these are
  // households they help care for, read-only plus checklist ticking.
  sitterConnections: SitterConnection[];
  /** Sitter invitations addressed to me that I have not accepted yet. */
  pendingSitterInvites: PendingSitterInvite[];
  loadingSitterConnections: boolean;
  /** Set when the last load failed — screens must distinguish this from "no clients". */
  sitterConnectionsError: string | null;
  refreshSitterConnections: () => Promise<void>;
  respondToSitterInvite: (connectionId: string, accept: boolean) => Promise<boolean>;
  /** Owner invites a sitter by email. Server rejects a non-owner. */
  inviteSitter: (householdId: string, email: string) => Promise<void>;
  /** Sitter connections ON a household, for the owner who manages them. */
  getSitterConnections: (householdId: string) => Promise<SitterInviteRow[]>;
  /** Owner revokes a sitter's access. Takes effect immediately. */
  revokeSitter: (connectionId: string) => Promise<void>;
  /** Crown status for a household: active, and when it was granted. */
  getCrownReceipt: (householdId: string) => Promise<CrownReceipt | null>;
  /** One household's pets — for the sitter view, which cannot filter its own lists. */
  getHouseholdPets: (householdId: string) => Promise<Pet[]>;
  /** One household's guides, same reason. */
  getHouseholdGuides: (householdId: string) => Promise<Guide[]>;
  /** Check-in feed for a household, newest first. */
  getCheckins: (householdId: string, limit?: number) => Promise<Checkin[]>;
  /** Post a check-in. The server pins authorship to the caller. */
  addCheckin: (input: { householdId: string; note: string; guideId?: string | null }) => Promise<void>;
  /** Delete one of MY OWN check-ins; the policy allows no others. */
  deleteCheckin: (checkinId: string) => Promise<void>;
  inviteToHousehold: (householdId: string, email: string) => Promise<void>;
  /**
   * Accept or decline an invite, including (on accept) the data refreshes and
   * the first-run onboarding tail.
   *
   * Resolves with the household new pets and guides will land in AFTER the
   * response — which is NOT necessarily the one just joined: the server adopts
   * the joined household only when the joiner's current default is empty and
   * was never chosen explicitly (migration 0011). Callers should tell the user
   * which one won. Null on decline, or when the signed-in user changed
   * mid-flight.
   */
  respondToInvite: (inviteId: string, accept: boolean) => Promise<string | null>;
  revokeInvite: (inviteId: string) => Promise<void>;
  /**
   * True once an invite accept has succeeded this session. First-run routing
   * must consult this: the user is a household member from that instant, but
   * the onboarding tail that records it takes several more round trips.
   */
  joinedViaInvite: boolean;
  /**
   * Leave a household. Also clears settings.primary_household_id when it named
   * that household, so a later re-invite doesn't silently resurrect a default
   * the user chose long ago. (An owner REMOVING someone can't do the same —
   * only that user's own session can write their settings row — so their
   * pointer does come back on a rejoin; the Household screen shows which
   * household is default and changes it in one tap.)
   */
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
  /** Set when the last settings load failed — distinguishes "couldn't ask" from "not onboarded". */
  settingsError: string | null;
  /** Re-run the settings load (retry after a failure, or verify a write landed). */
  refreshSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>;

  // Journeys (C3)
  /** settings.journeys with a stable {} fallback while settings load. */
  journeysState: Record<string, JourneyEntry>;
  /** Settle a journey as done/skipped by merging into settings.journeys. */
  setJourneyState: (key: string, status: 'done' | 'skipped') => Promise<void>;
  /**
   * Settle SEVERAL journeys in one settings write. Dismissing the founder
   * checklist also skips joiner-welcome; doing both atomically means no
   * intermediate render where only the first is settled (the joiner card
   * would flash in) and no partial-failure state if the second write dies.
   */
  setJourneyStates: (statuses: Record<string, 'done' | 'skipped'>) => Promise<void>;
  /**
   * Record a CTA tap for a predicate-less journey card ({cards:{id:true}}
   * merged into the stored entry; the journey itself stays pending).
   */
  setJourneyCardComplete: (key: string, cardId: string) => Promise<void>;
  /**
   * Member count of the primary household; null until the one-time lazy fetch
   * resolves. Only fetched (once per household, cached) while a journey is
   * still pending — JourneyCards waits for non-null before evaluating.
   */
  primaryHouseholdMemberCount: number | null;

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
  const { user, signOut } = useAuth();
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
  const [sitterConnections, setSitterConnections] = useState<SitterConnection[]>([]);
  const [pendingSitterInvites, setPendingSitterInvites] = useState<PendingSitterInvite[]>([]);
  const [loadingSitterConnections, setLoadingSitterConnections] = useState(false);
  const [sitterConnectionsError, setSitterConnectionsError] = useState<string | null>(null);
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
  // Set when the last settings load failed. Without it, "settings never
  // loaded" is indistinguishable from "loaded, not onboarded" — and since
  // nothing else re-fetches settings, first-run routing had no way to tell
  // the difference or offer a retry.
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Latest settings for async merge-writers (journey state merges into the
  // journeys jsonb). Kept in sync BOTH here (render) and directly inside
  // loadSettings/updateSettings, so two awaited journey writes in a row merge
  // on top of each other even before React re-renders between them.
  const settingsRef = useRef<AppSettings | null>(null);
  settingsRef.current = settings;

  // Primary-household member count for journey card predicates. Fetched
  // lazily (see effect below), never per render: at most once per staleness
  // window per household id.
  const [primaryHouseholdMemberCount, setPrimaryHouseholdMemberCount] = useState<number | null>(
    null
  );
  const memberCountFetchedFor = useRef<string | null>(null);

  /**
   * Latched the instant an invite ACCEPT succeeds, for the rest of the session.
   *
   * The user HAS joined a household from this moment, but the onboarding tail
   * that records it (skip founder-welcome, then complete onboarding) takes
   * several more round trips. In that window `onboarding_completed` is still
   * false and `pendingInvites` is already empty — exactly the condition Home
   * uses to send a first-run user to the founder wizard. A screen-local flag
   * can't cover it (the accept may happen on HouseholdScreen, and the user can
   * navigate back to Home mid-tail), so the latch lives here.
   */
  const [joinedViaInvite, setJoinedViaInvite] = useState(false);
  // When that fetch last ran. The staleness window lets the passive path
  // (refreshHouseholds on Home focus / AppState 'active') pick up REMOTE
  // membership changes — an invitee accepting on their own device — so the
  // founder's "Invite your family" tick can complete within a days-long PWA
  // session instead of caching strictly once per household id.
  const memberCountFetchedAt = useRef(0);

  // Onboarding state
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);

  // Derived state — memoized so the array identities only change when `pets`
  // does. Screens use these in effect/memo deps, so fresh identities on every
  // render would re-run those effects (and any auto-save they trigger) forever.
  const activePets = useMemo(() => pets.filter((p) => p.status === 'active'), [pets]);
  const deceasedPets = useMemo(() => pets.filter((p) => p.status === 'deceased'), [pets]);

  // ============================================
  // Dead-session guard
  // ============================================
  // Latched when a load fails AND the auth server confirms the sign-in is
  // gone. An auth failure that lands after mount is indistinguishable from a
  // wiped account from the user's side: every load returns nothing, so Home
  // renders "Welcome, <name>!" above 0 Pets, 0 Guides and the "Add your first
  // pet" empty state. Nothing is actually lost, but there is no way for the
  // user to know that.
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * Called from every load's catch block.
   *
   * Runs the probe on ANY load failure rather than on a guessed-at subset:
   * SupabaseAdapter throws bare `new Error(error.message)`, so the HTTP status
   * never reaches us and the message wording differs by cause (see
   * lib/sessionExpired.ts). Missing one costs the user the empty-but-happy
   * dashboard, while an extra probe costs one request on a path where a
   * request has already failed. The probe itself is deduped, so five loads
   * failing together ask once.
   */
  const noteLoadFailure = useCallback(async (uid: string | undefined) => {
    if (!uid) return;
    if (!(await confirmSessionLost())) return;
    // Same staleness discipline as the loads themselves. supabase-js may sign
    // out on its own while we are asking, in which case the app is already on
    // its way to the sign-in screen and must not be interrupted by an expiry
    // notice aimed at the user who just left.
    if (userIdRef.current !== uid) return;
    setSessionExpired(true);
  }, []);

  // ============================================
  // Load Initial Data
  // ============================================
  useEffect(() => {
    // Any change of signed-in user clears the latch: signing out is the fix
    // for an expired session, so the notice must not survive it.
    setSessionExpired(false);
    if (userId) {
      refreshPets();
      refreshGuides();
      refreshHouseholds();
      // At sign-in, NOT only when SitterHomeScreen mounts. Loading these lazily
      // from that screen created a loop with no entrance: Settings gates the
      // "My Clients" link on this data, so the only way to see the link was to
      // have already reached the screen it links to. QA found the whole sitter
      // side unreachable for a real user because of it.
      refreshSitterConnections();
      loadSettings();
      loadOnboardingState();
    } else {
      setPets([]);
      setGuides([]);
      setSitterConnections([]);
      setPendingSitterInvites([]);
      setHouseholds([]);
      setPendingInvites([]);
      setPrimaryHouseholdId(null);
      setPrimaryHouseholdMemberCount(null);
      memberCountFetchedFor.current = null;
      memberCountFetchedAt.current = 0;
      setJoinedViaInvite(false);
      setSettings(null);
      setSettingsError(null);
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
  const refreshPets = useCallback(async (opts?: { background?: boolean }) => {
    if (!userId) return;
    // A background refresh (e.g. Home regaining focus) must not raise the
    // loading flag: screens render '...' while it is true, so doing so blanks
    // the dashboard's counters on every single navigation back to Home.
    if (!opts?.background) setLoadingPets(true);
    try {
      const data = await dataService.getPets(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setPets(data);
      setPetsError(null);
    } catch (err: any) {
      console.error('Failed to load pets:', err);
      // Fire-and-forget: it decides on its own whether this was the session
      // dying, and does its own staleness check.
      void noteLoadFailure(userId);
      if (userIdRef.current !== userId) return;
      setPetsError(err?.message || 'Failed to load pets');
    } finally {
      if (userIdRef.current === userId) setLoadingPets(false);
    }
  }, [userId, noteLoadFailure]);

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
  const refreshGuides = useCallback(async (opts?: { background?: boolean }) => {
    if (!userId) return;
    // See refreshPets — background refreshes leave the loading flag alone.
    if (!opts?.background) setLoadingGuides(true);
    try {
      const data = await dataService.getGuides(userId);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setGuides(data);
      setGuidesError(null);
    } catch (err: any) {
      console.error('Failed to load guides:', err);
      void noteLoadFailure(userId);
      if (userIdRef.current !== userId) return;
      setGuidesError(err?.message || 'Failed to load guides');
    } finally {
      if (userIdRef.current === userId) setLoadingGuides(false);
    }
  }, [userId, noteLoadFailure]);

  const getPet = useCallback(async (petId: string) => {
    return dataService.getPet(petId);
  }, []);

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
  // Fetch the primary household's member count for journey card predicates
  // ("Invite your family" completes when householdMemberCount > 1). Called by
  // the lazy journey effect below and by the local membership mutations, so
  // the checklist tick doesn't stay stale for a whole PWA session.
  const loadMemberCount = useCallback(
    async (householdId: string) => {
      memberCountFetchedFor.current = householdId;
      memberCountFetchedAt.current = Date.now();
      try {
        const members = await dataService.getHouseholdMembers(householdId);
        if (userIdRef.current !== userId) return; // stale — user changed
        setPrimaryHouseholdMemberCount(members.length);
      } catch (err) {
        console.error('Failed to load household member count:', err);
        void noteLoadFailure(userId);
        if (userIdRef.current !== userId) return;
        // Fail open as "solo" so journeys still render instead of waiting
        // forever on a count that will not arrive.
        setPrimaryHouseholdMemberCount(1);
      }
    },
    [userId, noteLoadFailure]
  );

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
      void noteLoadFailure(userId);
      if (userIdRef.current !== userId) return;
      setHouseholdsError(err?.message || 'Failed to load households');
    } finally {
      if (userIdRef.current === userId) setHouseholdsLoading(false);
    }
  }, [userId, noteLoadFailure]);

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

  /**
   * Load the households this user sits for. Failure sets the error and leaves
   * the previous list alone: a sitter whose network blipped must not be shown
   * an empty client list, which reads as "your clients are gone".
   */
  const refreshSitterConnections = useCallback(async () => {
    if (!userId) return;
    setLoadingSitterConnections(true);
    try {
      // Both, because they answer different questions and only together
      // describe the sitter's situation: connections need sitter_user_id, which
      // is null until accept, so a pending invitation is invisible to the first
      // call and ONLY visible to the second.
      const [rows, pending] = await Promise.all([
        dataService.getMySitterConnections(),
        dataService.getMyPendingSitterInvites(),
      ]);
      if (userIdRef.current !== userId) return; // stale response — user changed
      setSitterConnections(rows);
      setPendingSitterInvites(pending);
      setSitterConnectionsError(null);
    } catch (err: any) {
      console.error('Failed to load sitter connections:', err);
      if (userIdRef.current !== userId) return;
      setSitterConnectionsError(err?.message || 'Failed to load your clients');
    } finally {
      if (userIdRef.current === userId) setLoadingSitterConnections(false);
    }
  }, [userId]);

  const respondToSitterInvite = useCallback(
    async (connectionId: string, accept: boolean) => {
      const accepted = await dataService.respondToSitterInvite(connectionId, accept);
      // Accepting grants read access to that household's pets and guides, so
      // both lists change underneath the sitter — refresh them alongside the
      // connection list rather than waiting for the next focus.
      await refreshSitterConnections();
      if (accept) {
        await Promise.all([
          refreshPets({ background: true }),
          refreshGuides({ background: true }),
        ]);
      }
      return accepted;
    },
    [refreshSitterConnections, refreshPets, refreshGuides]
  );

  const inviteSitter = useCallback(async (householdId: string, email: string) => {
    // Server messages here are written for people ("that email already has a
    // live connection to this household") — surface them as-is.
    await dataService.inviteSitter(householdId, email);
  }, []);

  const getSitterConnections = useCallback(
    (householdId: string) => dataService.getSitterConnections(householdId),
    []
  );

  const revokeSitter = useCallback(async (connectionId: string) => {
    await dataService.revokeSitter(connectionId);
  }, []);

  const getCrownReceipt = useCallback(
    (householdId: string) => dataService.getCrownReceipt(householdId),
    []
  );

  const getHouseholdPets = useCallback(
    (householdId: string) => dataService.getHouseholdPets(householdId),
    []
  );

  const getHouseholdGuides = useCallback(
    (householdId: string) => dataService.getHouseholdGuides(householdId),
    []
  );

  const getCheckins = useCallback(
    (householdId: string, limit?: number) => dataService.getCheckins(householdId, limit),
    []
  );

  const addCheckin = useCallback(
    (input: { householdId: string; note: string; guideId?: string | null }) =>
      dataService.addCheckin(input),
    []
  );

  const deleteCheckin = useCallback(
    (checkinId: string) => dataService.deleteCheckin(checkinId),
    []
  );

  const inviteToHousehold = useCallback(async (householdId: string, email: string) => {
    // Server throws 'invalid email' / 'that email already belongs to a
    // household member' — let the message propagate to the UI as-is.
    await dataService.inviteToHousehold(householdId, email);
  }, []);

  const respondToInvite = useCallback(
    async (inviteId: string, accept: boolean) => {
      // Capture identity BEFORE the first await. Reading it later would
      // capture whoever is signed in when the awaits resolve, which is
      // exactly the case the staleness guards below exist to catch.
      const uid = userIdRef.current;
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
        // Latch FIRST: from here on the user is a household member, and Home
        // must never route them to the founder wizard no matter how the rest
        // of this function goes or where the caller navigates meanwhile.
        setJoinedViaInvite(true);

        // Membership changed: drop the cached journey member count so the
        // journey effect refetches it against the (possibly new) primary
        // household instead of serving a stale tick all session.
        memberCountFetchedFor.current = null;
        await Promise.all([refreshHouseholds(), refreshPets(), refreshGuides()]);

        // Where new pets and guides will land now — the server decides on
        // accept (migration 0011 adopts the joined household only when the
        // joiner's current default is empty and was never chosen explicitly),
        // so the caller cannot predict it and must be told.
        //
        // Read it with a call that FAILS rather than trusting the household
        // state the refresh above just wrote: refreshHouseholds swallows its
        // own errors, so if that refresh lost the network primaryHouseholdId
        // still holds the PRE-accept value and we would confidently report the
        // wrong destination. The
        // Household screen would then say "new pets still go to <old>" and
        // offer to keep it — stating, and getting the user to confirm, the
        // opposite of the truth. Null means "we could not find out"; callers
        // treat that as "say nothing", which is the correct degradation.
        let joinedPrimaryId: string | null = null;
        try {
          joinedPrimaryId = await dataService.getMyPrimaryHousehold();
          if (userIdRef.current !== uid) return null; // user changed mid-flight
          // Doubles as a repair for the swallowed-refresh case above.
          setPrimaryHouseholdId(joinedPrimaryId);
        } catch (err) {
          console.error('invite accept: could not read the destination household', err);
          joinedPrimaryId = null;
        }

        // First-run joiner: settle onboarding here rather than in each caller.
        // Every accept path (the Home gate, the Home banner, the Household
        // screen) then behaves identically and can't be left half-done by a
        // caller that returns early or unmounts.
        //
        // Order matters: record the joiner marker BEFORE completing
        // onboarding. If the process dies between the two, the user is a
        // known joiner who still has onboarding pending (recoverable, and
        // Home keeps them out of the wizard via the latch). The reverse order
        // would mark them an onboarded FOUNDER with no journey state — and
        // JourneyCards would then silently auto-complete founder-welcome,
        // permanently suppressing the joiner tour.
        //
        // Called through dataService directly (not the context callbacks)
        // because those are declared below this one.
        if (userIdRef.current !== uid) return null; // user changed during refreshes
        if (uid) {
          try {
            // Always re-read from the server; never trust the snapshot here.
            // Two separate bugs live in that shortcut. (1) A null snapshot
            // means settings never loaded (loadSettings swallows its error),
            // NOT "already onboarded" — treating those the same silently
            // skipped the tail and left the user permanently un-onboarded
            // with their invite already consumed. (2) respond_to_invite
            // writes primary_household_id server-side whenever the joiner's
            // default was empty, so ANY snapshot taken before the accept is
            // stale in exactly that field — and the refresh further down runs
            // only for first-run joiners. An already-onboarded joiner would
            // carry the pre-accept null all session, which setPrimaryHousehold's
            // rollback then writes back OVER the real pointer (stranding them
            // again, the state this round exists to remove) and which makes
            // leaveHousehold's clear-the-pointer guard a no-op against its own
            // doc comment.
            const current = await dataService.getSettings(uid);
            if (userIdRef.current !== uid) return null;
            settingsRef.current = current;
            setSettings(current);
            if (current.onboarding_completed) return joinedPrimaryId; // nothing to settle

            const journeys = current.journeys ?? {};
            const afterSkip = await dataService.updateSettings(uid, {
              journeys: {
                ...journeys,
                'founder-welcome': {
                  ...journeys['founder-welcome'],
                  status: 'skipped',
                  version: JOURNEYS['founder-welcome']?.version ?? 1,
                  at: new Date().toISOString(),
                },
              },
            });
            if (userIdRef.current !== uid) return null; // user changed mid-flight
            settingsRef.current = afterSkip;
            setSettings(afterSkip);

            await dataService.completeOnboarding(uid);
            if (userIdRef.current !== uid) return null;
            setOnboardingState(null);

            const fresh = await dataService.getSettings(uid);
            if (userIdRef.current !== uid) return null;
            settingsRef.current = fresh;
            setSettings(fresh);
          } catch (err) {
            // Non-fatal for THIS session — the membership is committed and
            // joinedViaInvite keeps Home off the wizard. It is not
            // self-healing, though: the invite is consumed, so this function
            // never runs again. The safety net is Home's membership-aware
            // routing, which finishes the tail on a later launch for anyone
            // who belongs to a household they didn't create.
            console.error('invite accept: onboarding tail failed', err);
          }
        }
        return joinedPrimaryId;
      }
      await refreshHouseholds();
      return null; // declined — no destination to report
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
      const uid = userIdRef.current;
      await dataService.leaveHousehold(householdId);

      // Drop an explicit default that named the household we just left.
      // primary_household_of already refuses to honour it (it re-checks
      // membership), so leaving it behind is not wrong TODAY — but it is not
      // inert forever: on a later re-invite the membership comes back and the
      // dormant pointer silently retakes the default, months after the user
      // last thought about it. Clearing it on the way out means a rejoin
      // starts from the same "no explicit choice" state a first join does.
      // (Called through dataService, not the updateSettings callback: that one
      // is declared further down, so referencing it here hits the TDZ.)
      if (uid) {
        try {
          // Fetch the row if the ref never loaded rather than reading through
          // an optional chain: a null ref means settings never loaded
          // (loadSettings swallows its error), NOT "no pointer set", so the
          // guard below would silently skip the clear and leave exactly the
          // dormant pointer this block exists to remove.
          const before = settingsRef.current ?? (await dataService.getSettings(uid));
          if (before.primary_household_id === householdId) {
            const updated = await dataService.updateSettings(uid, {
              primary_household_id: null,
            });
            if (userIdRef.current === uid) {
              settingsRef.current = updated;
              setSettings(updated);
            }
          }
        } catch (err) {
          // Non-fatal: the membership is already gone and the pointer is
          // ignored while they are out. Worst case it resurrects on a rejoin,
          // which the Household screen shows and can change in one tap.
          console.error('leaveHousehold: could not clear the default household', err);
        }
      }

      await Promise.all([refreshHouseholds(), refreshPets(), refreshGuides()]);
    },
    [refreshHouseholds, refreshPets, refreshGuides]
  );

  const removeHouseholdMember = useCallback(
    async (householdId: string, memberUserId: string) => {
      // Owner-only per RLS; same last-owner guard as leaveHousehold.
      await dataService.removeHouseholdMember(householdId, memberUserId);
      // Membership changed: refetch the cached journey member count. The ref
      // is only ever populated while a journey is pending, so settled users
      // never pay this extra query. (loadMemberCount handles its own errors.)
      if (memberCountFetchedFor.current === householdId) {
        loadMemberCount(householdId);
      }
    },
    [loadMemberCount]
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
      settingsRef.current = data;
      setSettings(data);
      setSettingsError(null);
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      void noteLoadFailure(userId);
      if (userIdRef.current === userId) {
        setSettingsError(err?.message || 'Failed to load settings');
      }
    } finally {
      if (userIdRef.current === userId) setLoadingSettings(false);
    }
  }, [userId, noteLoadFailure]);

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      if (!userId) throw new Error('Not authenticated');
      const updated = await dataService.updateSettings(userId, updates);
      // Sync the ref immediately (not just on re-render) so a merge-writer
      // that runs right after this resolves sees the fresh row.
      settingsRef.current = updated;
      setSettings(updated);
      return updated;
    },
    [userId]
  );

  /**
   * Household operation, but declared HERE because it builds on
   * updateSettings, which is defined above (the household block runs before
   * this one, so referencing it from there would hit the TDZ).
   *
   * The write itself is just the settings pointer; the authority on "which
   * household is primary" stays the my_primary_household RPC (it validates
   * membership server-side), so re-read it instead of optimistically setting
   * primaryHouseholdId from the id we just wrote.
   */
  const setPrimaryHousehold = useCallback(
    async (householdId: string) => {
      if (!userId) throw new Error('Not authenticated');

      // Remember the pointer we are about to overwrite. NOTHING validates the
      // column at write time — it carries only the households FK and the
      // per-user settings policy — so an id the server will refuse to HONOUR
      // (0011 re-checks membership on read) still lands in the row. Writing
      // first and validating second would therefore destroy a good explicit
      // default on a tap that changes nothing: tap a household card that went
      // stale because an owner just removed you, and your real default is
      // overwritten with an id that is ignored, silently dropping you back to
      // the ordering fallback — the stranded state this whole round removes.
      // Read the row FRESH rather than trusting the cached ref. A null ref is
      // the obvious hazard (null is itself a meaningful previous value and
      // would clear a real choice), but a non-null ref goes stale just as
      // badly: nothing reloads settings when the server writes this column
      // outside this session — respond_to_invite's UPSERT on another device, or
      // 0011's backfill landing while a long-lived PWA tab stays open. Only
      // refreshHouseholds runs on AppState 'active', and it never touches
      // settings. One PK lookup on a path that already makes three round trips.
      const before = await dataService.getSettings(userId);
      if (userIdRef.current !== userId) return; // user changed mid-flight
      const previous = before.primary_household_id ?? null;

      // updateSettings syncs settingsRef + settings state (and creates the
      // settings row first if it somehow doesn't exist yet).
      await updateSettings({ primary_household_id: householdId });

      // Confirm the pointer took, HERE rather than leaving it to
      // refreshHouseholds — that one swallows its own errors, so a dropped
      // connection between the two round trips would resolve this call
      // normally while the badge stayed on the old card: a write that landed,
      // rendered as a silent no-op with no error for the user to act on. This
      // read throws, and a server that declined the pointer (not a member of
      // that household) throws too instead of quietly ignoring the tap.
      //
      // A THROWN read is not a decline, though, and must not be reported as
      // one: the write already landed, so restoring `previous` would undo a
      // change the server has, and "the default household did not change"
      // would tell the user to stop looking while every new pet lands
      // somewhere else. Say only what we actually know, and still reconcile
      // the badge from the server (refreshHouseholds swallows its own errors,
      // so it can only help) — if the connection is back by then the badge
      // moves and corroborates the message.
      let confirmed: string | null;
      try {
        confirmed = await dataService.getMyPrimaryHousehold();
      } catch (err) {
        console.error('setPrimaryHousehold: could not confirm the new default', err);
        if (userIdRef.current !== userId) return; // user changed mid-flight
        await refreshHouseholds();
        throw new Error(
          "We couldn't confirm the change — check your connection and reopen this screen."
        );
      }
      if (userIdRef.current !== userId) return; // user changed mid-flight

      if (confirmed !== householdId) {
        // Declined. Put the old pointer back so a refused tap is a true
        // no-op, then let refreshHouseholds re-read whatever the server now
        // considers primary (it swallows its own errors, and the throw below
        // is the signal that matters).
        try {
          await updateSettings({ primary_household_id: previous });
        } catch (err) {
          console.error('setPrimaryHousehold: could not restore the previous default', err);
        }
        if (userIdRef.current !== userId) return;
        await refreshHouseholds();
        throw new Error('The default household did not change. Please try again.');
      }

      setPrimaryHouseholdId(confirmed);

      // Reconcile the rest of the household state (names, members, invites).
      await refreshHouseholds();
    },
    [userId, updateSettings, refreshHouseholds]
  );

  // ============================================
  // Journey Operations (C3)
  // ============================================
  const journeysState = useMemo(() => settings?.journeys ?? {}, [settings]);

  const setJourneyStates = useCallback(
    async (statuses: Record<string, 'done' | 'skipped'>) => {
      if (!userId) throw new Error('Not authenticated');
      const journeys = settingsRef.current?.journeys ?? {};
      const at = new Date().toISOString();
      const next: Record<string, JourneyEntry> = { ...journeys };
      for (const [key, status] of Object.entries(statuses)) {
        next[key] = {
          ...journeys[key], // keep any per-card progress
          status,
          version: JOURNEYS[key]?.version ?? 1,
          at,
        };
      }
      await updateSettings({ journeys: next });
    },
    [userId, updateSettings]
  );

  const setJourneyState = useCallback(
    (key: string, status: 'done' | 'skipped') => setJourneyStates({ [key]: status }),
    [setJourneyStates]
  );

  const setJourneyCardComplete = useCallback(
    async (key: string, cardId: string) => {
      if (!userId) throw new Error('Not authenticated');
      const journeys = settingsRef.current?.journeys ?? {};
      const entry = journeys[key];
      if (entry?.cards?.[cardId]) return; // already recorded — skip the write
      const next: JourneyEntry = { ...entry, cards: { ...entry?.cards, [cardId]: true } };
      await updateSettings({ journeys: { ...journeys, [key]: next } });
    },
    [userId, updateSettings]
  );

  // Lazy member-count fetch for journey predicates. Runs only while a journey
  // could still show, and at most once per MEMBER_COUNT_STALE_MS per primary
  // household id — NOT on every refreshHouseholds (Home refocuses call that
  // constantly; the `households` dep re-runs this on each success and the
  // time guard turns almost all of those into no-ops). Local membership
  // mutations (accepting an invite, removing a member) invalidate the
  // ref-cache for an immediate refetch; the staleness window covers REMOTE
  // changes — the invitee accepting on their own device — so the founder's
  // "Invite your family" tick can still complete and celebrate within a
  // days-long PWA session. Settled users skip at the journey check and never
  // pay the query.
  useEffect(() => {
    if (!userId || !primaryHouseholdId || !settings) return;
    if (!getActiveJourney(settings.journeys)) return; // nothing pending — skip
    if (
      memberCountFetchedFor.current === primaryHouseholdId &&
      Date.now() - memberCountFetchedAt.current < MEMBER_COUNT_STALE_MS
    ) {
      return; // fresh enough — skip
    }
    loadMemberCount(primaryHouseholdId);
  }, [userId, primaryHouseholdId, settings, households, loadMemberCount]);

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
      void noteLoadFailure(userId);
    }
  }, [userId, noteLoadFailure]);

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
      getPet,
      getGuide,
      createGuide,
      updateGuide,
      deleteGuide,
      duplicateGuide,

      // Households
      households,
      householdsLoading,
      householdsError,
      sitterConnections,
      pendingSitterInvites,
      loadingSitterConnections,
      sitterConnectionsError,
      refreshSitterConnections,
      respondToSitterInvite,
      inviteSitter,
      getSitterConnections,
      revokeSitter,
      getCrownReceipt,
      getHouseholdPets,
      getHouseholdGuides,
      getCheckins,
      addCheckin,
      deleteCheckin,
      pendingInvites,
      primaryHouseholdId,
      setPrimaryHousehold,
      refreshHouseholds,
      inviteToHousehold,
      respondToInvite,
      revokeInvite,
      joinedViaInvite,
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
      settingsError,
      refreshSettings: loadSettings,
      updateSettings,

      // Journeys
      journeysState,
      setJourneyState,
      setJourneyStates,
      setJourneyCardComplete,
      primaryHouseholdMemberCount,

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
      getPet,
      getGuide,
      createGuide,
      updateGuide,
      deleteGuide,
      duplicateGuide,
      households,
      householdsLoading,
      householdsError,
      sitterConnections,
      pendingSitterInvites,
      loadingSitterConnections,
      sitterConnectionsError,
      refreshSitterConnections,
      respondToSitterInvite,
      inviteSitter,
      getSitterConnections,
      revokeSitter,
      getCrownReceipt,
      getHouseholdPets,
      getHouseholdGuides,
      getCheckins,
      addCheckin,
      deleteCheckin,
      pendingInvites,
      primaryHouseholdId,
      setPrimaryHousehold,
      refreshHouseholds,
      inviteToHousehold,
      respondToInvite,
      revokeInvite,
      joinedViaInvite,
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
      settingsError,
      loadSettings,
      updateSettings,
      journeysState,
      setJourneyState,
      setJourneyStates,
      setJourneyCardComplete,
      primaryHouseholdMemberCount,
      onboardingState,
      updateOnboardingStateCallback,
      completeOnboarding,
      exportAllData,
      importData,
      clearAllData,
    ]
  );

  // The way out of an expired session. Clearing the dead credentials is what
  // actually unblocks the user: AuthContext flips to signed-out, RootNavigator
  // swaps in the Auth stack, and the load effect above resets this provider —
  // including the latch. Errors propagate so the notice can say so; supabase-js
  // drops the local session even when the server rejects the logout, so in
  // practice only being offline gets that far.
  const handleExpiredSignIn = useCallback(async () => {
    await signOut();
  }, [signOut]);

  // A confirmed-dead session replaces the whole app UI rather than setting a
  // flag for screens to honour. The bug being fixed was Home rendering a
  // cheerful zero-state over an auth failure, so the requirement is that the
  // zero-state be UNREACHABLE in that condition — and a flag each screen has
  // to remember to check is not that. Every screen with an "add your first
  // thing" empty state sits inside these children.
  return (
    <DataContext.Provider value={value}>
      {sessionExpired ? (
        <SessionExpiredNotice onSignIn={handleExpiredSignIn} />
      ) : (
        children
      )}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
