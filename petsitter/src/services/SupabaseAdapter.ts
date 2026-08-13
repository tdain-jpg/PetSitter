import { supabase } from '../lib/supabase';
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
  SharedGuideBundle,
  generateShareCode,
  getCurrentTimestamp,
} from './DataService';

/**
 * Supabase implementation of DataService.
 *
 * Conventions:
 *  - userId arguments are tolerated for API compatibility, but RLS is the
 *    actual security boundary (auth.uid() = user_id). Callers must be signed in.
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
  async getPets(userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', userId)
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
    const { data, error } = await supabase
      .from('pets')
      .insert(pet)
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

  async getActivePets(userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pet[];
  }

  async getDeceasedPets(userId: string): Promise<Pet[]> {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', userId)
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
  async getGuides(userId: string): Promise<Guide[]> {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .eq('user_id', userId)
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
    const { data, error } = await supabase
      .from('guides')
      .insert(guide)
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
    const original = await this.getGuide(guideId);
    if (!original) throw new Error('Guide not found');
    const { id: _id, created_at: _ca, updated_at: _ua, ...copy } = original;
    return this.createGuide({ ...copy, title: `${original.title} (Copy)` });
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

  async getShareLinks(userId: string): Promise<ShareableLink[]> {
    const { data, error } = await supabase
      .from('share_links')
      .select('*')
      .eq('user_id', userId)
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

  async saveCheatSheet(cheatSheet: Omit<CheatSheet, 'id'>): Promise<CheatSheet> {
    const { data, error } = await supabase
      .from('cheat_sheets')
      .upsert(cheatSheet, { onConflict: 'guide_id' })
      .select('*')
      .single();
    return unwrap(data as CheatSheet | null, error);
  }

  async deleteCheatSheet(guideId: string): Promise<void> {
    const { error } = await supabase
      .from('cheat_sheets')
      .delete()
      .eq('guide_id', guideId);
    if (error) throw new Error(error.message);
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
  // Data Export/Import
  // ============================================
  async exportAllData(userId: string): Promise<ExportedData> {
    const [pets, guides, settings, shareLinks] = await Promise.all([
      this.getPets(userId),
      this.getGuides(userId),
      this.getSettings(userId),
      this.getShareLinks(userId),
    ]);

    const guideIds = guides.map((g) => g.id);
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

    // Wipe current user data, then insert fresh.
    await this.clearAllData(userId);

    // Pets — let DB assign new UUIDs (the old client-string IDs aren't valid uuids)
    const petIdMap: Record<string, string> = {};
    for (const p of data.pets) {
      const { id, created_at, updated_at, ...rest } = p;
      const inserted = await this.createPet({ ...rest, user_id: userId });
      petIdMap[id] = inserted.id;
    }

    // Guides — remap pet_ids
    const guideIdMap: Record<string, string> = {};
    for (const g of data.guides) {
      const { id, created_at, updated_at, pet_ids, ...rest } = g;
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
    const { user_id: _uid, ...settingsRest } = data.settings as AppSettings & {
      updated_at?: string;
    };
    delete settingsRest.updated_at;
    await this.updateSettings(userId, settingsRest);
  }

  async clearAllData(userId: string): Promise<void> {
    // Cascades from pets, guides handle children (task_completions, share_links, cheat_sheets).
    // supabase-js never rejects on Postgres/network errors — every result must
    // be checked, or a failed wipe would silently report success.
    const { error: petsErr } = await supabase.from('pets').delete().eq('user_id', userId);
    if (petsErr) throw new Error(petsErr.message);
    const { error: guidesErr } = await supabase.from('guides').delete().eq('user_id', userId);
    if (guidesErr) throw new Error(guidesErr.message);
    const { error: onboardingErr } = await supabase
      .from('onboarding_state')
      .delete()
      .eq('user_id', userId);
    if (onboardingErr) throw new Error(onboardingErr.message);
    // Reset settings (keep row, restore defaults)
    const { error: settingsErr } = await supabase
      .from('settings')
      .update({ ...DEFAULT_SETTINGS })
      .eq('user_id', userId);
    if (settingsErr) throw new Error(settingsErr.message);
  }
}

export const dataService = new SupabaseAdapter();
