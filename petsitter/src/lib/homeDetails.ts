import type { EmergencyContact, HomeDetails, HomeInfo, HomeOwner, Pet } from '../types';
import { generateId } from '../services';

/**
 * Turning a household's saved home details into a new guide's starting point.
 *
 * Kept in one place because three screens start guides (the guide form, Quick
 * Trip Setup and onboarding), and the rule for what a new guide inherits has to
 * be the same in all three, or one of them quietly starts blank again.
 */

const digits = (phone: string | undefined) => (phone ?? '').replace(/\D/g, '');

/** True when two contacts are the same person: same phone, or same name with no phone. */
function sameContact(a: { name: string; phone: string }, b: { name: string; phone: string }) {
  const pa = digits(a.phone);
  const pb = digits(b.phone);
  if (pa && pb) return pa === pb;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/** Owners as guide contacts: first in the list, the first owner primary. */
export function ownersAsContacts(owners: HomeOwner[]): EmergencyContact[] {
  return owners
    .filter((o) => o.name.trim() || o.phone.trim())
    .map((o, i) => ({
      id: generateId(),
      name: o.name.trim(),
      phone: o.phone.trim(),
      email: o.email?.trim() || undefined,
      relationship: 'Owner',
      contact_type: 'personal' as const,
      is_primary: i === 0,
    }));
}

/**
 * What a brand new guide starts with: the owners, then the saved contacts,
 * then the home info. Contact ids are fresh, because guides edit their copies
 * independently and two guides sharing an id would be a trap for later code.
 */
export function guidePrefillFrom(details: HomeDetails | null): {
  emergency_contacts: EmergencyContact[];
  home_info: HomeInfo;
} {
  if (!details) return { emergency_contacts: [], home_info: {} };
  const owners = ownersAsContacts(details.owners);
  const saved = details.emergency_contacts
    .filter((c) => !owners.some((o) => sameContact(o, c)))
    .map((c) => ({ ...c, id: generateId(), is_primary: owners.length > 0 ? false : c.is_primary }));
  return { emergency_contacts: [...owners, ...saved], home_info: { ...details.home_info } };
}

/** True when there is nothing in the details worth copying. */
export function isHomeDetailsEmpty(details: HomeDetails | null): boolean {
  if (!details) return true;
  const hasInfo = Object.values(details.home_info ?? {}).some((v) => typeof v === 'string' && v.trim());
  return !hasInfo && details.owners.length === 0 && details.emergency_contacts.length === 0;
}

/**
 * Each distinct vet on these pets' records, as a contact, minus any already in
 * `existing`. Two pets at the same clinic give one contact, not two.
 */
export function vetContactsFromPets(pets: Pet[], existing: EmergencyContact[]): EmergencyContact[] {
  const out: EmergencyContact[] = [];
  for (const pet of pets) {
    const vet = pet.vet_info;
    if (!vet || !(vet.phone?.trim() || vet.name?.trim() || vet.clinic?.trim())) continue;
    const name = [vet.name?.trim(), vet.clinic?.trim()].filter(Boolean).join(', ');
    const candidate = { name, phone: vet.phone?.trim() ?? '' };
    if ([...existing, ...out].some((c) => sameContact(c, candidate))) continue;
    out.push({
      id: generateId(),
      name,
      phone: candidate.phone,
      relationship: 'Vet',
      contact_type: 'vet_primary',
      is_primary: false,
      notes: vet.emergency_phone?.trim() ? `After hours: ${vet.emergency_phone.trim()}` : undefined,
    });
  }
  return out;
}
