import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../contexts';
import type { Pet } from '../types';

/**
 * Resolves one pet for a screen that can be opened by someone who does not own
 * it, and says whether the viewer may write to it.
 *
 * The same shape as useGuideWithPets, for the same reason and the same bug.
 * PetDetail looked the pet up in `activePets`/`deceasedPets`, which hold only
 * the caller's OWN households — so a connected sitter tapping their client's
 * pet card got a full-screen "Pet not found" for an animal they were standing
 * next to and had RLS permission to read. That card is the only route a sitter
 * has to the full record (the names on the client household screen are plain
 * text), so the read-only sitter view PetDetail's header comment describes had
 * never once been reachable.
 *
 * Context first, so an owner pays for no extra round trip and the screen stays
 * live as they edit; a by-id fetch second, which is where RLS actually decides.
 */
export interface ResolvedPet {
  pet: Pet | null;
  /** True until we have either a pet or a definite answer that there isn't one. */
  loading: boolean;
  /**
   * Whether the viewer may WRITE. Membership, not readability: `households`
   * holds only households the user belongs to.
   *
   * False for a resolved pet in someone else's household, true only while
   * nothing has resolved yet — so an owner's controls never flicker away, and a
   * sitter is never shown a Delete that RLS answers with a silent 204.
   */
  canEdit: boolean;
}

export function useResolvedPet(petId: string): ResolvedPet {
  const { activePets, deceasedPets, loadingPets, households, getPet } = useData();

  const localPet = useMemo(
    () => [...activePets, ...deceasedPets].find((p) => p.id === petId) ?? null,
    [activePets, deceasedPets, petId]
  );

  const [fetched, setFetched] = useState<Pet | null>(null);
  const [fetching, setFetching] = useState(false);
  // Which id the fetched value belongs to, so moving between two pets never
  // shows the previous one during the next one's fetch.
  const fetchedFor = useRef<string | null>(null);

  const pet = localPet ?? (fetchedFor.current === petId ? fetched : null);

  useEffect(() => {
    if (localPet) return; // context has it
    if (loadingPets) return; // let the context load settle first
    if (fetchedFor.current === petId) return; // already answered for this id

    let cancelled = false;
    setFetching(true);
    (async () => {
      let row: Pet | null = null;
      try {
        row = await getPet(petId);
      } catch {
        // A failed read and a row RLS hides are the same answer here: there is
        // nothing to show. Distinguishing them would leak whether the id exists.
        row = null;
      }
      if (cancelled) return;
      fetchedFor.current = petId;
      setFetched(row);
      setFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [petId, localPet, loadingPets, getPet]);

  const canEdit = useMemo(() => {
    if (!pet) return true; // nothing resolved yet — don't flicker controls away
    if (!pet.household_id) return true; // pre-household pet
    return households.some((h) => h.id === pet.household_id);
  }, [pet, households]);

  return {
    pet,
    // Hold the spinner until the fallback has had its turn: "not found" before
    // the by-id fetch resolves is the false negative this hook exists to stop.
    loading: !pet && (loadingPets || fetching || fetchedFor.current !== petId),
    canEdit,
  };
}
