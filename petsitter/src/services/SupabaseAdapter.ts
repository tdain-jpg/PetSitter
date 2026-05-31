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
    return this.updatePet(petId, { status: 'active', deceased_date: undefined });
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
    // Upsert by (task_id, date) — unique constraint in schema
    const { data, error } = await supabase
      .from('task_completions')
      .upsert(completion, { onConflict: 'task_id,date' })
      .select('*')
      .single();
    return unwrap(data as TaskCompletion | null, error);
  }

  async markTaskIncomplete(taskId: string, date: string): Promise<void> {
    const { error } = await supabase
      .from('task_completions')
      .delete()
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
    // Deactivate any existing active links for this guide
    await supabase
      .from('share_links')
      .update({ is_active: false })
      .eq('guide_id', guideId)
      .eq('is_active', true);

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

  async getSharedGuide(code: string): Promise<Guide | null> {
    const { data, error } = await supabase.rpc('resolve_share', { p_code: code });
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (data as { guide: Guide }).guide;
  }

  async getSharedGuidePets(code: string): Promise<Pet[]> {
    const { data, error } = await supabase.rpc('resolve_share', { p_code: code });
    if (error) throw new Error(error.message);
    if (!data) return [];
    return ((data as { pets: Pet[] }).pets) ?? [];
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

    // First time — insert defaults
    const initial: AppSettings = { ...DEFAULT_SETTINGS, user_id: userId };
    const { data: inserted, error: insErr } = await supabase
      .from('settings')
      .insert(initial)
      .select('*')
      .single();
    return unwrap(inserted as AppSettings | null, insErr);
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
    const [pets, guides, settings] = await Promise.all([
      this.getPets(userId),
      this.getGuides(userId),
      this.getSettings(userId),
    ]);

    const guideIds = guides.map((g) => g.id);
    let taskCompletions: TaskCompletion[] = [];
    if (guideIds.length > 0) {
      const { data, error } = await supabase
        .from('task_completions')
        .select('*')
        .in('guide_id', guideIds);
      if (error) throw new Error(error.message);
      taskCompletions = (data ?? []) as TaskCompletion[];
    }

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

    // Settings
    await this.updateSettings(userId, data.settings);
  }

  async clearAllData(userId: string): Promise<void> {
    // Cascades from pets, guides handle children (task_completions, share_links, cheat_sheets)
    await supabase.from('pets').delete().eq('user_id', userId);
    await supabase.from('guides').delete().eq('user_id', userId);
    await supabase.from('onboarding_state').delete().eq('user_id', userId);
    // Reset settings (keep row, restore defaults)
    await supabase
      .from('settings')
      .update({ ...DEFAULT_SETTINGS })
      .eq('user_id', userId);
  }
}

export const dataService = new SupabaseAdapter();
