import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../contexts';
import type { Guide, Pet } from '../types';

/**
 * Resolves a guide and the pets it covers, for screens that can be opened by
 * someone who does not own them.
 *
 * WHY THIS EXISTS
 *
 * Every guide screen used to do `guides.find((g) => g.id === guideId)` and
 * render "Guide not found" when that missed. That was correct while `guides`
 * meant "every guide this user can see". It stopped being correct when
 * SupabaseAdapter.getPets/getGuides were scoped to the caller's OWN households
 * — the right fix for a real bug, where a sitter's "My Pets" filled up with
 * their client's animals — because from that moment a connected sitter's
 * context arrays could not contain a client's guide by construction.
 *
 * The result was that a sitter tapping a care guide from their client's
 * household got a full-screen "Guide not found", for a guide the database was
 * perfectly willing to hand them. Every read-only sitter path through
 * GuideDetail, DailyRoutine, HomeCare and PDF export was unreachable, and all
 * of the careful owner-only gating on those screens was gating a screen nobody
 * could open.
 *
 * So: look in context first — instant, and stays live as the owner edits — and
 * fall back to fetching the row by id. RLS is what decides whether that fetch
 * returns anything, which is the same boundary as before; the only thing that
 * changes is that we now ask the server instead of concluding "not found" from
 * an array that was never going to have it.
 *
 * The fallback deliberately waits for the context load to settle. Firing it
 * immediately would mean every owner opening their own guide pays for a
 * redundant round trip before the array they already have arrives.
 */

export interface ResolvedGuide {
  guide: Guide | null;
  pets: Pet[];
  /** True until we have either a guide or a definite answer that there isn't one. */
  loading: boolean;
  /**
   * Whether the caller may WRITE to this guide. Membership, not readability:
   * `households` holds only households the user belongs to, so a guide whose
   * household is missing from it is one being read as a sitter.
   *
   * Note this is false-by-default for a RESOLVED guide with an unknown
   * household, and true only while nothing is resolved yet. The screens used to
   * derive this from a `find` that missed, which returned "editable" for
   * exactly the sitter case it was meant to catch.
   */
  canEdit: boolean;
}

export function useGuideWithPets(guideId: string): ResolvedGuide {
  const {
    guides,
    loadingGuides,
    activePets,
    deceasedPets,
    loadingPets,
    households,
    getGuide,
    getPet,
  } = useData();

  const localGuide = useMemo(
    () => guides.find((g) => g.id === guideId) ?? null,
    [guides, guideId]
  );
  const localPets = useMemo(() => [...activePets, ...deceasedPets], [activePets, deceasedPets]);

  const [fetchedGuide, setFetchedGuide] = useState<Guide | null>(null);
  const [fetchedPets, setFetchedPets] = useState<Pet[]>([]);
  const [fetching, setFetching] = useState(false);
  // Which guide id the fetched state belongs to, so navigating between two
  // guides never shows the previous one's data during the new one's fetch.
  const fetchedFor = useRef<string | null>(null);

  const guide = localGuide ?? (fetchedFor.current === guideId ? fetchedGuide : null);

  useEffect(() => {
    if (localGuide) return; // context has it — nothing to fetch
    if (loadingGuides) return; // let the context load finish first
    if (fetchedFor.current === guideId) return; // already answered for this id

    let cancelled = false;
    setFetching(true);
    (async () => {
      let row: Guide | null = null;
      try {
        row = await getGuide(guideId);
      } catch {
        // A failed read and an invisible row are the same answer to this
        // screen: there is nothing to show. The screen says so; it does not
        // need to distinguish "denied" from "deleted", and saying which would
        // leak whether the id exists.
        row = null;
      }
      if (cancelled) return;
      fetchedFor.current = guideId;
      setFetchedGuide(row);
      setFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [guideId, localGuide, loadingGuides, getGuide]);

  // The guide's pets, same two-step. Only the ids the local arrays are missing
  // are fetched, so an owner never triggers a request and a sitter fetches
  // exactly the animals on the guide in front of them.
  const petIds = guide?.pet_ids;
  const missingIds = useMemo(() => {
    if (!petIds?.length) return [];
    const have = new Set(localPets.map((p) => p.id));
    return petIds.filter((id) => !have.has(id));
  }, [petIds, localPets]);
  const missingKey = missingIds.join(',');

  useEffect(() => {
    if (!missingIds.length) {
      setFetchedPets([]);
      return;
    }
    if (loadingPets) return;

    let cancelled = false;
    (async () => {
      const rows = await Promise.all(
        missingIds.map((id) => getPet(id).catch(() => null))
      );
      if (cancelled) return;
      setFetchedPets(rows.filter((p): p is Pet => p !== null));
    })();

    return () => {
      cancelled = true;
    };
    // missingKey, not missingIds: the array identity changes on every render of
    // the parent, and depending on it would refetch in a loop.
  }, [missingKey, loadingPets, getPet]); // eslint-disable-line react-hooks/exhaustive-deps

  const pets = useMemo(() => {
    if (!petIds?.length) return [];
    const byId = new Map<string, Pet>();
    for (const p of [...localPets, ...fetchedPets]) byId.set(p.id, p);
    // Ordered by the guide's own pet_ids so the screen matches what the owner
    // arranged, not whichever array happened to resolve first.
    return petIds.map((id) => byId.get(id)).filter((p): p is Pet => p != null);
  }, [petIds, localPets, fetchedPets]);

  const canEdit = useMemo(() => {
    if (!guide) return true; // nothing resolved yet — don't flicker controls away
    if (!guide.household_id) return true; // pre-household guide
    return households.some((h) => h.id === guide.household_id);
  }, [guide, households]);

  return {
    guide,
    pets,
    // Hold the spinner until the fallback has had its turn: declaring "not
    // found" while a fetch is still in flight is a false negative, and it is
    // the one this hook exists to stop showing.
    loading: !guide && (loadingGuides || fetching || fetchedFor.current !== guideId),
    canEdit,
  };
}
