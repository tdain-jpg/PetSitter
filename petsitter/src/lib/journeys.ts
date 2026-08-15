import type { Pet, Guide, JourneyEntry } from '../types';
import type { MainStackParamList } from '../navigation/types';

// ============================================
// Journey framework (contract C2)
// ============================================
// A "journey" is a lightweight, dismissible onboarding checklist/tour rendered
// on Home by <JourneyCards />. State persists in settings.journeys (jsonb) —
// see JourneyEntry in src/types for the stored shape. A journey shows when it
// has no settled entry (no status recorded) OR the stored version is older
// than the registry version below (bumping a version re-shows the journey).

/** Live app data the card predicates evaluate against. */
export interface JourneyData {
  activePets: Pet[];
  guides: Guide[];
  householdMemberCount: number;
}

export interface JourneyCard {
  id: string;
  title: string;
  body: string;
  /**
   * `screen` is keyed to the real route list, so a typo in the registry is a
   * compile error rather than a runtime crash when the card is tapped.
   */
  cta?: { label: string; screen: keyof MainStackParamList; params?: object };
  /**
   * Live completion predicate. Cards WITHOUT one complete when their CTA is
   * tapped (recorded in the entry's cards map via setJourneyCardComplete).
   */
  isComplete?: (data: JourneyData) => boolean;
}

export interface JourneyDef {
  key: 'founder-welcome' | 'joiner-welcome';
  version: number;
  title: string;
  cards: JourneyCard[];
}

export const JOURNEYS: Record<string, JourneyDef> = {
  'founder-welcome': {
    key: 'founder-welcome',
    version: 1,
    title: 'Welcome to Pawstructions',
    cards: [
      {
        id: 'add-pet',
        title: 'Add your first pet',
        body: 'Start with a profile — name, feeding, meds, and quirks.',
        cta: { label: 'Add a Pet', screen: 'PetForm', params: { mode: 'create' } },
        isComplete: (data) => data.activePets.length > 0,
      },
      {
        id: 'create-guide',
        title: 'Create a care guide',
        body: 'Bundle everything a sitter needs for a stay into one guide.',
        cta: { label: 'Create a Guide', screen: 'GuideForm', params: { mode: 'create' } },
        isComplete: (data) => data.guides.length > 0,
      },
      {
        // No predicate — completes when its CTA is tapped.
        id: 'share-guide',
        title: 'Share it with a sitter',
        body: "Sitters don't need an account — send them a share link straight from any guide.",
        cta: { label: 'View Guides', screen: 'Guides' },
      },
      {
        id: 'invite-family',
        title: 'Invite your family',
        body: 'Household members see and edit the same pets and guides as you.',
        cta: { label: 'Invite Family', screen: 'Household' },
        isComplete: (data) => data.householdMemberCount > 1,
      },
    ],
  },
  'joiner-welcome': {
    key: 'joiner-welcome',
    version: 1,
    title: "You've joined a household",
    cards: [
      {
        id: 'shared',
        // Deliberately scoped to what you can SEE and EDIT. Do not widen this
        // to "anything you add is shared" until new pets/guides actually land
        // in the joined household: primary_household_of prefers a household
        // you own, so a joiner's personal (empty) household still wins and
        // silently receives anything they create. Tracked in ROADMAP as the
        // joiner-primary-household fix.
        title: 'The household’s pets are all here',
        body: 'You can open and edit every pet and guide your household has already set up — nothing to re-create.',
      },
      {
        id: 'live-edits',
        title: 'Edits update for everyone',
        body: 'Changes autosave as you type and go live for every household member right away.',
      },
      {
        id: 'sitter-links',
        title: "Sitters don't need accounts",
        body: "When a guide is ready, send its share link — that's how guides go out to sitters.",
      },
    ],
  },
};

/**
 * C2 visibility: a journey is pending (may show) when it has no settled entry
 * — i.e. no status recorded, which includes entries holding only per-card
 * progress — or the stored version is older than the registry version.
 */
export function isJourneyPending(def: JourneyDef, entry: JourneyEntry | undefined): boolean {
  if (!entry?.status) return true;
  return (entry.version ?? 0) < def.version;
}

/**
 * The single journey that may currently show (at most one — C4), or null.
 *
 * founder-welcome always takes priority. joiner-welcome is gated on
 * founder-welcome being SKIPPED, because that's the marker the accept flow
 * (C5) writes when a user accepts an invite instead of founding their own
 * household ("joiner-welcome left unset so it shows"). A founder whose
 * checklist finishes as 'done' must never see "You've joined a household".
 */
export function getActiveJourney(
  journeys: Record<string, JourneyEntry> | undefined
): JourneyDef | null {
  const state = journeys ?? {};
  const founder = JOURNEYS['founder-welcome'];
  const joiner = JOURNEYS['joiner-welcome'];
  if (isJourneyPending(founder, state[founder.key])) return founder;
  if (state[founder.key]?.status === 'skipped' && isJourneyPending(joiner, state[joiner.key])) {
    return joiner;
  }
  return null;
}

/** A card is complete via its live predicate, or (predicate-less) via a recorded CTA tap. */
export function isCardComplete(
  card: JourneyCard,
  entry: JourneyEntry | undefined,
  data: JourneyData
): boolean {
  if (card.isComplete) return card.isComplete(data);
  return entry?.cards?.[card.id] === true;
}
