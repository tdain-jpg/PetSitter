import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  SitterInviteRow,
  TaskCompletion,
  ShareableLink,
  CheatSheet,
  AppSettings,
  OnboardingState,
} from '../types';
import {
  DataService,
  ExportedData,
  SharedGuideBundle,
  generateShareCode,
  getCurrentTimestamp,
} from './DataService';

/**
 * Supabase implementation of DataService.
 *
 * Conventions:
 *  - MERGED-VIEW MODEL: a user may belong to multiple households and sees all
 *    of their households' pets/guides merged. Pet/guide list queries do NOT
 *    filter by user_id — RLS (household membership) is the security boundary.
 *    userId arguments are tolerated for interface compatibility but ignored
 *    where noted. Callers must be signed in.
 *  - pets.user_id / guides.user_id are attribution-only and server-pinned;
 *    never filter by them.
 *  - New pets omit household_id so the server default places them in the
 *    user's primary household (my_primary_household()). New guides MAY carry
 *    household_id (kept with their pets' household); when omitted the same
 *    server default applies.
 *  - Top-level rows use UUIDs generated server-side (omitted from inserts).
 *  - Nested entities (FeedingSchedule[], Medication[], etc.) live inside JSONB
 *    columns and keep their existing string IDs assigned client-side.
 */

const DEFAULT_SETTINGS: Omit<AppSettings, 'user_id'> = {
  theme: 'system',
  notifications_enabled: true,
  auto_save_enabled: true,
  onboarding_completed: false,
};

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned');
  return data;
}

export class SupabaseAdapter implements DataService {
  // ============================================
  // Pet Operations
  // ============================================
  /** @param _userId Deprecated: ignored — RLS scopes rows to the user's households. */
  async getPets(_userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pet[];
  }

  async getPet(petId: string): Promise<Pet | null> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('id', petId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Pet | null) ?? null;
  }

  async createPet(pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'>): Promise<Pet> {
    // Never send household_id: the server default assigns the user's primary
    // household. (A future household picker would relax this.)
    const { household_id: _hh, ...row } = pet;
    const { data, error } = await supabase
      .from('pets')
      .insert(row)
      .select('*')
      .single();
    return unwrap(data as Pet | null, error);
  }

  async updatePet(petId: string, updates: Partial<Pet>): Promise<Pet> {
    // NOTE: keys with value `undefined` are DROPPED from the JSON body by
    // supabase-js — they leave the stored column untouched. To clear a
    // nullable column, pass `null` explicitly (see restorePet).
    // Strip immutable fields if accidentally included
    const { id: _id, created_at: _ca, updated_at: _ua, ...patch } = updates as Partial<Pet>;
    const { data, error } = await supabase
      .from('pets')
      .update(patch)
      .eq('id', petId)
      .select('*')
      .single();
    return unwrap(data as Pet | null, error);
  }

  async deletePet(petId: string): Promise<void> {
    const { error } = await supabase.from('pets').delete().eq('id', petId);
    if (error) throw new Error(error.message);
  }

  /** @param _userId Deprecated: ignored — RLS scopes rows to the user's households. */
  async getActivePets(_userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pet[];
  }

  /** @param _userId Deprecated: ignored — RLS scopes rows to the user's households. */
  async getDeceasedPets(_userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('status', 'deceased')
      .order('deceased_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pet[];
  }

  async markPetDeceased(petId: string, deceasedDate: string): Promise<Pet> {
    return this.updatePet(petId, { status: 'deceased', deceased_date: deceasedDate });
  }

  async restorePet(petId: string): Promise<Pet> {
    // Must be null, not undefined — undefined would be dropped from the PATCH
    // body and the stale deceased_date would persist in the DB.
    return this.updatePet(petId, { status: 'active', deceased_date: null });
  }

  // ============================================
  // Guide Operations
  // ============================================
  /** @param _userId Deprecated: ignored — RLS scopes rows to the user's households. */
  async getGuides(_userId: string): Promise<Guide[]> {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Guide[];
  }

  async getGuide(guideId: string): Promise<Guide | null> {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .eq('id', guideId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Guide | null) ?? null;
  }

  async createGuide(guide: Omit<Guide, 'id' | 'created_at' | 'updated_at'>): Promise<Guide> {
    // household_id is FORWARDED when provided so a guide can be created in the
    // same household as its pets (RLS validates membership); when omitted the
    // server default assigns the user's primary household. Callers restoring
    // foreign data (importData) must strip household_id themselves.
    const { household_id, ...rest } = guide;
    const row = household_id ? { ...rest, household_id } : rest;
    const { data, error } = await supabase
      .from('guides')
      .insert(row)
      .select('*')
      .single();
    return unwrap(data as Guide | null, error);
  }

  async updateGuide(guideId: string, updates: Partial<Guide>): Promise<Guide> {
    // NOTE: `undefined` values are DROPPED from the JSON body (column keeps
    // its stored value); pass `null` to explicitly clear a nullable column.
    const { id: _id, created_at: _ca, updated_at: _ua, ...patch } = updates as Partial<Guide>;
    const { data, error } = await supabase
      .from('guides')
      .update(patch)
      .eq('id', guideId)
      .select('*')
      .single();
    return unwrap(data as Guide | null, error);
  }

  async deleteGuide(guideId: string): Promise<void> {
    // cheat_sheets, task_completions, and share_links all cascade via FK on delete
    const { error } = await supabase.from('guides').delete().eq('id', guideId);
    if (error) throw new Error(error.message);
  }

  async duplicateGuide(guideId: string): Promise<Guide> {
    // The copy keeps the ORIGINAL's household_id (createGuide forwards it), so
    // duplicating a guide from a shared household never strands the copy in
    // the duplicator's primary household with pet_ids its members can't see.
    const original = await this.getGuide(guideId);
    if (!original) throw new Error('Guide not found');
    // free_generation_used_at is STRIPPED, so the copy starts with its free
    // cheat sheet unspent. A duplicate is a NEW guide, and the promise stated on
    // Terms/About is that every guide gets one free sheet. Copying the marker
    // made the duplicate born already-spent, so the first Generate on a guide
    // the user had just created answered 402 "this guide has already had its
    // free cheat sheet" — flatly untrue of a guide that never had one. The
    // column has no default, so omitting it from the INSERT means NULL.
    //
    // It used to be copied because the per-guide marker was the only thing
    // bounding cost, and a fresh allowance per duplicate meant unlimited free AI
    // calls. That reason is gone: 0014 added ai_free_generations, a per-ACCOUNT
    // append-only ledger the client can neither read, write nor delete, and
    // generate-cheat-sheet enforces the rolling free-tier ceiling from it. The
    // per-GUIDE marker now carries only the product PROMISE; the per-ACCOUNT
    // ledger carries the abuse BOUND. Duplicating in a loop therefore buys no
    // extra generations — it spends the same account ceiling either way.
    //
    // importData deliberately does the OPPOSITE (see its own note on this
    // column, in the guides loop of the restore): a restore
    // re-creates the guides the user already had, so their recorded state is
    // what must come back; a duplicate is a guide that did not exist before.
    // The column is not on the Guide type, so it is named via the cast below in
    // order to be destructured away.
    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      free_generation_used_at: _freeGen,
      ...copy
    } = original as Guide & { free_generation_used_at?: string | null };
    // Prune pet ids whose pets row no longer exists: deletePet does no
    // guides.pet_ids cleanup, and 0007's guides_validate_pet_ids trigger
    // would reject the copy's INSERT outright over a ghost id. RLS scopes the
    // select to the user's households, which covers every live pet the
    // original may validly reference.
    let petIds = copy.pet_ids ?? [];
    if (petIds.length > 0) {
      const { data: petRows, error: petsErr } = await supabase
        .from('pets')
        .select('id')
        .in('id', petIds);
      if (petsErr) throw new Error(petsErr.message);
      const liveIds = new Set(((petRows ?? []) as { id: string }[]).map((p) => p.id));
      petIds = petIds.filter((pid) => liveIds.has(pid));
    }
    return this.createGuide({ ...copy, pet_ids: petIds, title: `${original.title} (Copy)` });
  }

  // ============================================
  // Task Completion Operations
  // ============================================
  async getTaskCompletions(guideId: string, date: string): Promise<TaskCompletion[]> {
    const { data, error } = await supabase
      .from('task_completions')
      .select('*')
      .eq('guide_id', guideId)
      .eq('date', date);
    if (error) throw new Error(error.message);
    return (data ?? []) as TaskCompletion[];
  }

  async markTaskComplete(completion: Omit<TaskCompletion, 'id'>): Promise<TaskCompletion> {
    // Upsert by (guide_id, task_id, date) — unique constraint in schema
    // (0004_fixes.sql). Scoping to the guide prevents completions from
    // colliding across guides that share generated task ids.
    const { data, error } = await supabase
      .from('task_completions')
      .upsert(completion, { onConflict: 'guide_id,task_id,date' })
      .select('*')
      .single();
    return unwrap(data as TaskCompletion | null, error);
  }

  async markTaskIncomplete(guideId: string, taskId: string, date: string): Promise<void> {
    const { error } = await supabase
      .from('task_completions')
      .delete()
      .eq('guide_id', guideId)
      .eq('task_id', taskId)
      .eq('date', date);
    if (error) throw new Error(error.message);
  }

  async getCompletionHistory(guideId: string): Promise<TaskCompletion[]> {
    const { data, error } = await supabase
      .from('task_completions')
      .select('*')
      .eq('guide_id', guideId)
      .order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TaskCompletion[];
  }

  // ============================================
  // Share Operations
  // ============================================
  async createShareLink(
    guideId: string,
    userId: string,
    expiresInDays?: number
  ): Promise<ShareableLink> {
    // Deactivate any existing active links for this guide. A silent failure
    // here would leave an old code resolving alongside the new one, so abort
    // creation if the revoke didn't apply.
    const { error: deactivateError } = await supabase
      .from('share_links')
      .update({ is_active: false })
      .eq('guide_id', guideId)
      .eq('is_active', true);
    if (deactivateError) throw new Error(deactivateError.message);

    const newLink = {
      guide_id: guideId,
      user_id: userId,
      code: generateShareCode(),
      expires_at: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null,
      is_active: true,
      view_count: 0,
    };

    const { data, error } = await supabase
      .from('share_links')
      .insert(newLink)
      .select('*')
      .single();
    return unwrap(data as ShareableLink | null, error);
  }

  async getShareLink(code: string): Promise<ShareableLink | null> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    return data as ShareableLink;
  }

  /**
   * The user's OWN links only (user_id-filtered). Per-user scope is only
   * right where the caller wants "what I created" — exportAllData. For
   * showing a guide's links use getShareLinksForGuide: since 0007 share_links
   * are household-scoped, and a housemate's live link hidden by a user_id
   * filter would be silently deactivated by createShareLink.
   */
  async getShareLinks(userId: string): Promise<ShareableLink[]> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ShareableLink[];
  }

  /**
   * Every share link for a guide, across the whole household — deliberately
   * NO user_id filter (RLS scopes visibility to household members).
   * ShareGuideScreen must use this view: createShareLink deactivates EVERY
   * active link for the guide, so a member has to see housemates' live links
   * before creating a new one kills them.
   */
  async getShareLinksForGuide(guideId: string): Promise<ShareableLink[]> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('guide_id', guideId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ShareableLink[];
  }

  async deactivateShareLink(linkId: string): Promise<void> {
    const { error } = await supabase
      .from('share_links')
      .update({ is_active: false })
      .eq('id', linkId);
    if (error) throw new Error(error.message);
  }

  async incrementViewCount(linkId: string): Promise<void> {
    // For owner-side use only; resolve_share() RPC handles anon view counts.
    const { data: current, error: readErr } = await supabase
      .from('share_links')
      .select('view_count')
      .eq('id', linkId)
      .single();
    if (readErr) throw new Error(readErr.message);
    const { error } = await supabase
      .from('share_links')
      .update({ view_count: (current?.view_count ?? 0) + 1 })
      .eq('id', linkId);
    if (error) throw new Error(error.message);
  }

  async getSharedGuideBundle(code: string): Promise<SharedGuideBundle | null> {
    // ONE resolve_share call returns guide + pets together. The RPC increments
    // view_count on every invocation, so callers must not split this into two.
    const { data, error } = await supabase.rpc('resolve_share', { p_code: code });
    if (error) throw new Error(error.message);
    if (!data) return null;
    const payload = data as { guide: Guide; pets: Pet[] | null };
    return { guide: payload.guide, pets: payload.pets ?? [] };
  }

  async getSharedGuide(code: string): Promise<Guide | null> {
    // Compatibility wrapper — prefer getSharedGuideBundle (each of these
    // wrappers costs a full RPC call and a view_count increment).
    const bundle = await this.getSharedGuideBundle(code);
    return bundle?.guide ?? null;
  }

  async getSharedGuidePets(code: string): Promise<Pet[]> {
    // Compatibility wrapper — prefer getSharedGuideBundle.
    const bundle = await this.getSharedGuideBundle(code);
    return bundle?.pets ?? [];
  }

  // ============================================
  // AI Cheat Sheet Operations
  // ============================================
  async getCheatSheet(guideId: string): Promise<CheatSheet | null> {
    const { data, error } = await supabase
      .from('cheat_sheets')
      .select('*')
      .eq('guide_id', guideId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CheatSheet | null) ?? null;
  }

  // Cheat-sheet WRITES live server-side in the generate-cheat-sheet Edge
  // Function (Crown-gated); deletion rides the guides FK cascade. The client
  // deliberately has no write path that could bypass the Crown gate.

  // ============================================
  // Crown Purchase
  // ============================================
  /**
   * Open a Stripe Checkout session for the one-time Crown purchase and return
   * the hosted URL to send the buyer to.
   *
   * The client never sees a price, a Stripe key, or an entitlement write:
   * amount and product live in the Edge Function, and `crown_until` is written
   * only by the webhook. This call just says "this household wants to buy" —
   * the function re-checks membership itself before creating the session, so a
   * guessed household id gets an error, never a checkout page.
   *
   * Contract (create-checkout-session):
   *   POST { householdId?: string, guideId?: string }  with the caller's JWT
   *   200 { url: string }                    hosted Checkout URL
   *   400 { error: 'bad_request' }
   *   400 { error: 'no_household' }          caller has no household to buy for
   *   401 { error: 'unauthorized' }
   *   404 { error: 'household_not_found' }   missing OR caller is not a member
   *   409 { error: 'already_crowned' }
   *   502 { error: 'stripe_failed' }
   *   503 { error: 'billing_not_configured' }
   *
   * @param householdId The household to crown. Optional in the contract (the
   * function falls back to my_primary_household), but the UI resolves and
   * NAMES the household before the buyer commits, so it always sends the one
   * it showed them.
   * @param guideId Optional: the sheet the buyer was trying to unlock. It only
   * rides along in Stripe's return URLs.
   */
  async createCrownCheckoutSession(householdId: string, guideId?: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { householdId, guideId },
    });

    if (error) {
      // Non-2xx responses surface as a FunctionsHttpError whose `context` is
      // the raw Response; the JSON body carries the contract error code.
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          code = body?.error;
        } catch {
          // Body wasn't JSON — fall through to the generic message.
        }
      }
      // Unknown codes deliberately fall through to the generic message rather
      // than a guess: this contract is owned by the Edge Function, and
      // inventing copy for a code we don't recognise risks describing the
      // wrong failure to someone who is trying to pay us.
      switch (code) {
        case 'already_crowned':
          throw new Error('This household already has Crown — there is nothing to pay.');
        case 'household_not_found':
          // The function answers "no such household" and "not your household"
          // identically on purpose; this copy must not tell them apart either.
          throw new Error(
            "We couldn't find that household. You may no longer be a member of it."
          );
        case 'no_household':
          throw new Error(
            "We couldn't work out which household to unlock. Open Household from Settings, then try again."
          );
        case 'unauthorized':
          throw new Error('Please sign in again, then try once more.');
        case 'billing_not_configured':
          throw new Error("Checkout isn't open yet. Please try again soon.");
        default:
          throw new Error('Something went wrong starting checkout. Please try again.');
      }
    }

    const url = (data as { url?: string } | null)?.url;
    // A 200 with no URL is a broken session, not a silent no-op: returning
    // normally here would leave the buyer staring at a button that did nothing.
    if (!url) throw new Error('Checkout did not open. Please try again.');
    return url;
  }

  // ============================================
  // Settings Operations
  // ============================================
  async getSettings(userId: string): Promise<AppSettings> {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as AppSettings;

    // First time — create defaults. Upsert with ignoreDuplicates (ON CONFLICT
    // DO NOTHING) so two concurrent first-time calls (e.g. loadSettings racing
    // completeOnboarding) can't throw a duplicate-key error or clobber the
    // row the other call just created; then read back the winning row.
    const initial: AppSettings = { ...DEFAULT_SETTINGS, user_id: userId };
    const { error: upsertErr } = await supabase
      .from('settings')
      .upsert(initial, { onConflict: 'user_id', ignoreDuplicates: true });
    if (upsertErr) throw new Error(upsertErr.message);

    const { data: row, error: selErr } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    return unwrap(row as AppSettings | null, selErr);
  }

  async updateSettings(userId: string, updates: Partial<AppSettings>): Promise<AppSettings> {
    // Ensure row exists, then update
    await this.getSettings(userId);
    const { data, error } = await supabase
      .from('settings')
      .update(updates)
      .eq('user_id', userId)
      .select('*')
      .single();
    return unwrap(data as AppSettings | null, error);
  }

  // ============================================
  // Onboarding Operations
  // ============================================
  async getOnboardingState(userId: string): Promise<OnboardingState | null> {
    const { data, error } = await supabase
      .from('onboarding_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OnboardingState | null) ?? null;
  }

  async updateOnboardingState(
    userId: string,
    state: Partial<OnboardingState>
  ): Promise<OnboardingState> {
    const row = {
      user_id: userId,
      current_step: 'welcome',
      completed_steps: [] as string[],
      ...state,
    };
    const { data, error } = await supabase
      .from('onboarding_state')
      .upsert(row, { onConflict: 'user_id' })
      .select('*')
      .single();
    return unwrap(data as OnboardingState | null, error);
  }

  async completeOnboarding(userId: string): Promise<void> {
    await this.updateSettings(userId, { onboarding_completed: true });
    const { error } = await supabase
      .from('onboarding_state')
      .delete()
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // ============================================
  // Household Operations
  // ============================================
  async getMyHouseholds(): Promise<Household[]> {
    // RLS: members see their own households only.
    const { data, error } = await supabase
      .from('households')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Household[];
  }

  /**
   * Membership rows only (user_id, role, joined date). LIMITATION: other
   * members' emails/display names are NOT readable — household_members
   * references auth.users (no PostgREST join to profiles), and profiles RLS
   * only allows reading one's OWN profile, so fetching other members'
   * profiles silently returns nothing. Render 'You' for the current user and
   * role + joined date for others. A future security-definer RPC can expose
   * member display names.
   */
  async getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
    const { data, error } = await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HouseholdMember[];
  }

  async getHouseholdInvites(householdId: string): Promise<HouseholdInviteRow[]> {
    // RLS: members see all of their household's invites (any status).
    const { data, error } = await supabase
      .from('household_invites')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as HouseholdInviteRow[];
  }

  async getMyPendingInvites(): Promise<PendingInvite[]> {
    const { data, error } = await supabase.rpc('my_pending_invites');
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingInvite[];
  }

  async inviteToHousehold(householdId: string, email: string): Promise<void> {
    // Server throws 'invalid email' / 'that email already belongs to a
    // household member' — surface the message as-is for the UI.
    const { error } = await supabase.rpc('invite_to_household', {
      h: householdId,
      invite_email: email,
    });
    if (error) throw new Error(error.message);
  }

  async respondToInvite(inviteId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_to_invite', {
      invite: inviteId,
      accept,
    });
    if (error) throw new Error(error.message);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.rpc('revoke_invite', { invite: inviteId });
    if (error) throw new Error(error.message);
  }

  // --------------------------------------------------------------------------
  // Sitter connections (0015)
  //
  // A connected sitter is NOT a household member: they read the household's
  // pets and guides and tick checklist tasks, and can write nothing else. Every
  // mutation below goes through a SECURITY DEFINER RPC because
  // sitter_connections has a SELECT policy and no write policies at all — there
  // is deliberately no client path that writes the table directly.
  // --------------------------------------------------------------------------

  /**
   * Sitter invitations addressed to me that I have NOT accepted yet.
   * getMySitterConnections cannot return these — see PendingSitterInvite.
   */
  async getMyPendingSitterInvites(): Promise<PendingSitterInvite[]> {
    const { data, error } = await supabase.rpc('my_pending_sitter_invites');
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingSitterInvite[];
  }

  /** Households this user sits for. The sitter's client list. */
  async getMySitterConnections(): Promise<SitterConnection[]> {
    const { data, error } = await supabase.rpc('my_sitter_connections');
    if (error) throw new Error(error.message);
    return (data ?? []) as SitterConnection[];
  }

  /**
   * Sitter connections ON a household, for the owner who manages them. Read
   * straight from the table: the SELECT policy already scopes this to the
   * household's owner, the sitter themselves, and anyone the row is addressed
   * to by email.
   */
  async getSitterConnections(householdId: string): Promise<SitterInviteRow[]> {
    const { data, error } = await supabase
      .from('sitter_connections')
      .select('id, household_id, email, sitter_user_id, status, starts_on, ends_on, created_at, responded_at')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SitterInviteRow[];
  }

  /** The check-in feed for a household, newest first. */
  async getCheckins(householdId: string, limit = 50): Promise<Checkin[]> {
    const { data, error } = await supabase.rpc('household_checkins', {
      h: householdId,
      limit_count: limit,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as Checkin[];
  }

  /**
   * Post a check-in. author_user_id is sent because the INSERT policy pins it
   * to auth.uid() in WITH CHECK — without it a sitter could post under someone
   * else's name, so the server refuses anything that does not match.
   */
  async addCheckin(input: {
    householdId: string;
    note: string;
    guideId?: string | null;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) throw new Error('Not authenticated');
    const { error } = await supabase.from('sitter_checkins').insert({
      household_id: input.householdId,
      author_user_id: uid,
      note: input.note,
      guide_id: input.guideId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /** Remove one of MY OWN check-ins. The policy allows no others. */
  async deleteCheckin(checkinId: string): Promise<void> {
    const { error } = await supabase.from('sitter_checkins').delete().eq('id', checkinId);
    if (error) throw new Error(error.message);
  }

  /** Owner invites a sitter by email. Server rejects a non-owner. */
  async inviteSitter(householdId: string, email: string): Promise<string> {
    const { data, error } = await supabase.rpc('invite_sitter', {
      h: householdId,
      sitter_email: email,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * Accept or decline a sitter invitation. The server reports a missing
   * connection and one addressed to somebody else with the SAME message, so a
   * connection id is never an existence oracle — surface it as-is.
   */
  async respondToSitterInvite(connectionId: string, accept: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc('respond_to_sitter_invite', {
      connection: connectionId,
      accept,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  /** Owner revokes a sitter's access. Returns false if it was already revoked. */
  async revokeSitter(connectionId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('revoke_sitter', {
      connection: connectionId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async leaveHousehold(householdId: string): Promise<void> {
    // Delete own membership row (RLS permits self-leave). The server throws
    // 'cannot remove the last owner of a household' when applicable.
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw new Error(sessionErr.message);
    const uid = sessionData.session?.user?.id;
    if (!uid) throw new Error('Not signed in');
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', uid);
    if (error) throw new Error(error.message);
  }

  async removeHouseholdMember(householdId: string, userId: string): Promise<void> {
    // RLS permits owner-removes-member; same last-owner guard as leaving.
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async renameHousehold(householdId: string, name: string): Promise<void> {
    // Owner-only, enforced server-side.
    const { error } = await supabase.rpc('rename_household', {
      h: householdId,
      new_name: name,
    });
    if (error) throw new Error(error.message);
  }

  async getMyPrimaryHousehold(): Promise<string | null> {
    const { data, error } = await supabase.rpc('my_primary_household');
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  }

  // ============================================
  // Data Export/Import
  // ============================================
  /**
   * Exports the user's PRIMARY household only — the exact scope importData
   * wipes and restores, so export/import are inverses (and the Settings copy
   * "REPLACES every pet, guide, and share link in your household" is true).
   * Exporting the merged view here would poison later imports: rows from
   * OTHER households would be duplicated into the primary household while
   * their originals survive the primary-only wipe. Rows without household_id
   * (pre-migration backups' shape) are kept. Share links remain per-user
   * (getShareLinks), narrowed to the exported guides.
   */
  async exportAllData(userId: string): Promise<ExportedData> {
    const [allPets, allGuides, settings, allShareLinks, primaryHouseholdId] = await Promise.all([
      this.getPets(userId),
      this.getGuides(userId),
      this.getSettings(userId),
      this.getShareLinks(userId),
      this.getMyPrimaryHousehold(),
    ]);

    const pets = allPets.filter(
      (p) => !p.household_id || p.household_id === primaryHouseholdId
    );
    const guides = allGuides.filter(
      (g) => !g.household_id || g.household_id === primaryHouseholdId
    );
    const guideIds = guides.map((g) => g.id);
    const guideIdSet = new Set(guideIds);
    const shareLinks = allShareLinks.filter((l) => guideIdSet.has(l.guide_id));
    let taskCompletions: TaskCompletion[] = [];
    let cheatSheets: CheatSheet[] = [];
    if (guideIds.length > 0) {
      const [completionsRes, sheetsRes] = await Promise.all([
        supabase.from('task_completions').select('*').in('guide_id', guideIds),
        supabase.from('cheat_sheets').select('*').in('guide_id', guideIds),
      ]);
      if (completionsRes.error) throw new Error(completionsRes.error.message);
      if (sheetsRes.error) throw new Error(sheetsRes.error.message);
      taskCompletions = (completionsRes.data ?? []) as TaskCompletion[];
      cheatSheets = (sheetsRes.data ?? []) as CheatSheet[];
    }

    return {
      version: '1.1',
      exported_at: getCurrentTimestamp(),
      pets,
      guides,
      task_completions: taskCompletions,
      share_links: shareLinks,
      cheat_sheets: cheatSheets,
      settings,
    };
  }

  /**
   * Validate an import payload's shape. MUST run before the destructive wipe
   * in importData — a malformed file must never cost the user their live data.
   */
  private validateImportPayload(data: ExportedData): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Import failed: the file is not a valid backup.');
    }
    if (typeof data.version !== 'string' || !data.version.startsWith('1.')) {
      throw new Error(
        `Import failed: unsupported backup version "${String((data as { version?: unknown }).version)}".`
      );
    }
    if (
      !Array.isArray(data.pets) ||
      !Array.isArray(data.guides) ||
      !Array.isArray(data.task_completions)
    ) {
      throw new Error(
        'Import failed: backup is missing its pets, guides, or task_completions list.'
      );
    }
    if (data.share_links !== undefined && !Array.isArray(data.share_links)) {
      throw new Error('Import failed: share_links must be a list.');
    }
    if (data.cheat_sheets !== undefined && !Array.isArray(data.cheat_sheets)) {
      throw new Error('Import failed: cheat_sheets must be a list.');
    }
    if (!data.settings || typeof data.settings !== 'object') {
      throw new Error('Import failed: backup is missing settings.');
    }
    data.pets.forEach((p, i) => {
      if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.species !== 'string') {
        throw new Error(`Import failed: pet #${i + 1} is missing its id, name, or species.`);
      }
    });
    data.guides.forEach((g, i) => {
      if (!g || typeof g.id !== 'string' || typeof g.title !== 'string' || !Array.isArray(g.pet_ids)) {
        throw new Error(`Import failed: guide #${i + 1} is missing its id, title, or pet list.`);
      }
    });
  }

  async importData(userId: string, data: ExportedData): Promise<void> {
    // Validate the payload BEFORE the destructive wipe.
    this.validateImportPayload(data);

    // Scope the restore to the PRIMARY household — the same scope the wipe
    // below clears. Older (v1.1) backups exported the MERGED view, so without
    // this filter a multi-household user's import would (a) duplicate other
    // households' pets/guides into their primary household (the originals
    // survive the primary-only wipe), and (b) crash mid-restore on the
    // share_links UNIQUE(code) constraint — the preserved codes still exist
    // on the un-wiped households' guides. Rows without household_id
    // (pre-household backups) are kept. Dependent task_completions /
    // share_links / cheat_sheets drop out automatically via the id maps.
    const primaryHouseholdId = await this.getMyPrimaryHousehold();
    const petsToRestore = data.pets.filter(
      (p) => !p.household_id || p.household_id === primaryHouseholdId
    );
    const guidesToRestore = data.guides.filter(
      (g) => !g.household_id || g.household_id === primaryHouseholdId
    );

    // ABORT BEFORE THE WIPE whenever nothing would be restored — silent,
    // irreversible data loss dressed as a successful import. Two ways to get
    // here, and BOTH must throw before clearAllData runs:
    //
    //  1. The household filter dropped everything. v1.1 exports bake
    //     household_id into every row, so a backup restored into a different
    //     account (or after the primary household changed) matches nothing.
    //  2. The backup was empty to begin with. A brand-new user who taps
    //     Export before adding anything gets a file with pets: [] and
    //     guides: [] — it validates cleanly and looks harmless. It is not:
    //     once they join a family household and migration 0011 adopts it as
    //     their default, importing that old file would wipe everyone else's
    //     pets, guides and live share links and restore nothing. An empty
    //     backup can only ever destroy, so it is refused outright.
    if (petsToRestore.length === 0 && guidesToRestore.length === 0) {
      throw new Error(
        data.pets.length > 0 || data.guides.length > 0
          ? 'Import failed: this backup belongs to a different household or account, so nothing would be restored.'
          : 'Import failed: this backup contains no pets or guides, so importing it would delete everything in this household and restore nothing.'
      );
    }

    // Wipe the user's PRIMARY household only (see clearAllData), then insert
    // fresh. Restoring a backup must never delete rows in households the
    // backup cannot recreate — other households' pets/guides are untouched.
    // Re-inserted rows land in the primary household: household_id is stripped
    // below so the server default applies (an exported household_id may
    // reference a household the user has since left).
    await this.clearAllData(userId, primaryHouseholdId);

    // Pets — let DB assign new UUIDs (the old client-string IDs aren't valid uuids)
    const petIdMap: Record<string, string> = {};
    for (const p of petsToRestore) {
      const { id, created_at, updated_at, ...rest } = p;
      const inserted = await this.createPet({ ...rest, user_id: userId });
      petIdMap[id] = inserted.id;
    }

    // Guides — remap pet_ids. household_id is stripped explicitly: createGuide
    // now forwards it when present, and a backup's household_id may reference
    // a household the user has left (the insert would violate RLS).
    //
    // free_generation_used_at is deliberately NOT stripped, and must not be.
    // The Guide type does not declare it, so it rides through `rest` as an
    // untyped runtime key and createGuide hands it to the INSERT — which 0013
    // leaves unguarded on purpose (its trigger is BEFORE UPDATE only). A
    // restored guide therefore arrives with its free-sheet allowance in the
    // state the backup recorded.
    //
    // Stripping it looks like the anti-farming move and is the opposite of one.
    // The column has no default, so stripping means every restored guide gets
    // NULL — a fresh free AI generation — and the three cases decide it:
    //   * backup says NULL (unspent guide): NULL either way. No difference.
    //   * backup says a timestamp (spent guide): carrying keeps it spent;
    //     stripping hands the allowance back, turning one Export + Import tap
    //     in Settings into a household-wide reset of every guide's free sheet.
    //   * backup HAND-EDITED to NULL on a spent guide: NULL either way — which
    //     is the whole point. What an edited file smuggles in IS a NULL, so
    //     stripping cannot close that path; it only breaks the honest one.
    //
    // duplicateGuide DOES strip it, and the two paths genuinely differ: a
    // duplicate is a guide that did not exist a moment ago, so "every guide gets
    // one free cheat sheet" applies to it afresh, while a restore re-creates the
    // guides this household already had — their allowance is part of the state
    // the backup recorded, exactly like their titles and routines. Neither path
    // bounds cost any more; 0014's per-account ledger does that.
    // exportAllData keeps writing the column for the same reason: drop it from
    // the file and the restore has nothing to carry. Do not "clean up" this
    // destructure.
    const guideIdMap: Record<string, string> = {};
    for (const g of guidesToRestore) {
      const { id, created_at, updated_at, pet_ids, household_id: _hh, ...rest } = g;
      const remappedPetIds = (pet_ids || []).map((pid) => petIdMap[pid]).filter(Boolean);
      const inserted = await this.createGuide({
        ...rest,
        user_id: userId,
        pet_ids: remappedPetIds,
      });
      guideIdMap[id] = inserted.id;
    }

    // Task completions — remap guide_id; drop any that reference unknown guides
    const remappedCompletions = data.task_completions
      .map((c) => ({
        ...c,
        guide_id: guideIdMap[c.guide_id],
      }))
      .filter((c) => c.guide_id);
    if (remappedCompletions.length > 0) {
      const { error } = await supabase
        .from('task_completions')
        .insert(remappedCompletions.map(({ id, ...rest }) => rest));
      if (error) throw new Error(error.message);
    }

    // Share links — remap guide_id (drop links to unknown guides), preserve
    // codes so URLs a sitter already has keep resolving after a restore.
    const remappedLinks = (data.share_links ?? [])
      .map((l) => ({ ...l, guide_id: guideIdMap[l.guide_id] }))
      .filter((l) => l.guide_id);
    if (remappedLinks.length > 0) {
      const { error } = await supabase.from('share_links').insert(
        remappedLinks.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: userId }))
      );
      if (error) throw new Error(error.message);
    }

    // Cheat sheets — remap guide_id
    const remappedSheets = (data.cheat_sheets ?? [])
      .map((c) => ({ ...c, guide_id: guideIdMap[c.guide_id] }))
      .filter((c) => c.guide_id);
    if (remappedSheets.length > 0) {
      const { error } = await supabase
        .from('cheat_sheets')
        .insert(remappedSheets.map(({ id, ...rest }) => rest));
      if (error) throw new Error(error.message);
    }

    // Settings — strip identity/DB-managed fields: the exported row carries
    // the ORIGINAL exporter's user_id, and writing it into another account
    // violates RLS. The row must belong to the current user.
    //
    // primary_household_id goes with them. It is current-account membership
    // state, not backup content: restoring a backup taken BEFORE the user
    // picked a different default would silently move the default back — the
    // restored rows would sit in the household the restore targeted while
    // every pet added afterwards landed somewhere else (the ROADMAP-4b bug,
    // reintroduced through the restore path). It is also a real FK, so a
    // backup naming a household that no longer exists here would fail this
    // update AFTER the wipe and full restore had already run, reporting
    // "Import failed" for an import that actually succeeded.
    const {
      user_id: _uid,
      primary_household_id: _primaryHouseholdId,
      ...settingsRest
    } = data.settings as AppSettings & {
      updated_at?: string;
    };
    delete settingsRest.updated_at;
    // Backups taken before journeys existed carry no `journeys` key, and the
    // clearAllData above reset it to {}. Restoring only the other keys would
    // hand an established user the "Add your first pet" welcome checklist —
    // the exact state migration 0010 exists to prevent, reintroduced through
    // the import path. Settle it the same way 0010 does.
    const journeys =
      settingsRest.journeys ??
      (settingsRest.onboarding_completed
        ? {
            'founder-welcome': {
              status: 'done' as const,
              version: 1,
              at: new Date().toISOString(),
            },
          }
        : {});
    await this.updateSettings(userId, { ...settingsRest, journeys });
  }

  /**
   * DESTRUCTIVE: deletes every pet and guide in the user's PRIMARY household —
   * including rows other members of that household created (the Settings
   * screen copy warns accordingly). Pets/guides in OTHER households the user
   * belongs to are deliberately untouched: an RLS-scoped unfiltered delete
   * would destroy housemates' data in every household the user has joined.
   * onboarding_state and settings resets remain per-user.
   *
   * @param knownPrimaryHouseholdId Optional (implementation-only): pass the
   * already-fetched primary household id so importData's restore filter and
   * this wipe are guaranteed to target the same household with one RPC.
   */
  async clearAllData(userId: string, knownPrimaryHouseholdId?: string | null): Promise<void> {
    // Cascades from pets, guides handle children (task_completions, share_links, cheat_sheets).
    // supabase-js never rejects on Postgres/network errors — every result must
    // be checked, or a failed wipe would silently report success.
    const primaryHouseholdId =
      knownPrimaryHouseholdId !== undefined
        ? knownPrimaryHouseholdId
        : await this.getMyPrimaryHousehold();
    if (primaryHouseholdId) {
      const { error: petsErr } = await supabase
        .from('pets')
        .delete()
        .eq('household_id', primaryHouseholdId);
      if (petsErr) throw new Error(petsErr.message);
      const { error: guidesErr } = await supabase
        .from('guides')
        .delete()
        .eq('household_id', primaryHouseholdId);
      if (guidesErr) throw new Error(guidesErr.message);
    }
    const { error: onboardingErr } = await supabase
      .from('onboarding_state')
      .delete()
      .eq('user_id', userId);
    if (onboardingErr) throw new Error(onboardingErr.message);
    // Reset settings (keep row, restore defaults). journeys is cleared
    // explicitly: clearAllData returns the user to a brand-new state (it also
    // resets onboarding_completed), so settled welcome journeys must not
    // survive and suppress the checklist on the restarted account.
    // DEFAULT_SETTINGS itself stays journeys-free so getSettings' first-time
    // upsert keeps relying on the column default.
    const { error: settingsErr } = await supabase
      .from('settings')
      .update({ ...DEFAULT_SETTINGS, journeys: {} })
      .eq('user_id', userId);
    if (settingsErr) throw new Error(settingsErr.message);
  }
}

export const dataService = new SupabaseAdapter();
