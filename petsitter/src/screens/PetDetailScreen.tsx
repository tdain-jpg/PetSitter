import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { showAlert, showConfirm } from '../lib/dialogs';
import { todayLocal } from '../lib/dates';
import { displayablePhotoUrl } from '../lib/petPhotos';
import { Button, SectionHeader, ScreenContainer, Icon, speciesIconName } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Household, Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'PetDetail'>;

/** Label/value row matching the GuideDetail/SharedGuideView style. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row">
      <Text className="text-tan-500 w-28">{label}:</Text>
      <Text className="text-brown-800 flex-1">{value}</Text>
    </View>
  );
}

/** Label row with a tappable phone number, dialing like ContactCard does. */
function PhoneRow({ label, phone }: { label: string; phone: string }) {
  return (
    <View className="flex-row">
      <Text className="text-tan-500 w-28">{label}:</Text>
      <Pressable
        onPress={() => Linking.openURL(`tel:${phone}`)}
        accessibilityRole="button"
        accessibilityLabel={`Call ${label} at ${phone}`}
        className="flex-1"
      >
        <Text className="text-secondary-600">📞 {phone}</Text>
      </Pressable>
    </View>
  );
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PetDetailScreen({ navigation, route }: Props) {
  const { petId } = route.params;
  const {
    activePets,
    deceasedPets,
    loadingPets,
    petsError,
    deletePet,
    markPetDeceased,
    restorePet,
    guides,
    updatePet,
    updateGuide,
    households,
  } = useData();

  /**
   * A CONNECTED SITTER reaches this screen from their client view. They are not
   * a household member, so RLS refuses every write here — and that refusal is
   * exactly what made this dangerous rather than merely untidy: deletePet's
   * PostgREST call returns 204 with ZERO rows affected, which reads as success,
   * so the screen navigated away and the sitter walked off believing they had
   * deleted their client's animal. Nothing was lost; their confidence in the
   * app should have been.
   *
   * `households` holds only households the user BELONGS to. Defaults to
   * editable while pets are still loading so an owner never sees their own
   * controls flicker away.
   */
  const canEdit = useMemo(() => {
    const found = [...activePets, ...deceasedPets].find((p) => p.id === petId);
    if (!found?.household_id) return true; // pre-household pet, or not loaded yet
    return households.some((h) => h.id === found.household_id);
  }, [activePets, deceasedPets, petId, households]);

  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingHousehold, setMovingHousehold] = useState(false);
  // Destination list expanded — only ever used when there's more than one
  // household to move to; a single destination moves straight away.
  const [choosingTarget, setChoosingTarget] = useState(false);

  useEffect(() => {
    const allPets = [...activePets, ...deceasedPets];
    const foundPet = allPets.find((p) => p.id === petId);
    setPet(foundPet || null);
    setLoading(false);
  }, [petId, activePets, deceasedPets]);

  const handleEdit = () => {
    (navigation as any).navigate('PetForm', { mode: 'edit', petId });
  };

  const handleDelete = async () => {
    if (!pet) return;
    const ok = await showConfirm({
      title: `Delete ${pet.name}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePet(petId);
      navigation.goBack();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to delete pet');
    }
  };

  const handleMemorial = async () => {
    if (!pet) return;
    const ok = await showConfirm({
      title: 'Move to Memorial',
      message: `Move ${pet.name} to memorial? You can restore them later.`,
      confirmLabel: 'Move',
    });
    if (!ok) return;
    // Local calendar day — toISOString() would stamp tomorrow's date for a
    // user behind UTC late in the evening.
    const today = todayLocal();
    try {
      await markPetDeceased(petId, today);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to move pet to memorial');
    }
  };

  const handleRestore = async () => {
    try {
      await restorePet(petId);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to restore pet');
    }
  };

  // Guides that describe this pet. 0007's guides_validate_pet_ids trigger
  // requires every pet a guide lists to live in the GUIDE's household, so
  // these two rows must stay on the same side of a move.
  const attachedGuides = guides.filter((g) => g.pet_ids.includes(petId));
  // Only reachable after a move was interrupted between the pet write and the
  // guide writes: the guide now points across the household boundary, its
  // sitters stop seeing this pet (resolve_share filters pets by the guide's
  // household) and its next save would be rejected. Offer the repair.
  // canEdit too: the repair issues guide writes, which a sitter cannot make.
  const strayGuides = pet && canEdit
    ? attachedGuides.filter((g) => g.household_id && g.household_id !== pet.household_id)
    : [];

  // guides.pet_ids keeps the ids of DELETED pets: no migration adds a cleanup
  // trigger and deletePet only drops the row, which is why GuideFormScreen
  // prunes on hydrate. A ghost id must not read as a pet staying behind —
  // that refuses the move for a guide which visibly covers only this pet, and
  // this screen is the only way to un-strand one. If the pets load FAILED,
  // prune nothing and treat every id as live: refusing a move is recoverable,
  // wiping a healthy guide's pet list is not.
  //
  // Component scope, not per-handler: BOTH write paths need it. 0007's trigger
  // fires on `update of pet_ids, household_id`, so even a household-only PATCH
  // revalidates the STORED pet_ids against the destination — meaning the
  // "Finish the move" repair below would be rejected by the same ghost that
  // handleMoveHousehold prunes, leaving an interrupted move unrepairable.
  const livePetIds = petsError
    ? null
    : new Set([...activePets, ...deceasedPets].map((p) => p.id));
  const survivingPetIds = (guide: Guide) =>
    livePetIds ? guide.pet_ids.filter((id) => livePetIds.has(id)) : guide.pet_ids;

  /**
   * Move this pet — and the guides that describe only this pet — into another
   * household the user belongs to. This is the ONLY way to un-strand a pet
   * that was created while the default household pointed at the wrong place:
   * migration 0011 fixes where NEW rows land, it moves none of the old ones.
   */
  const handleMoveHousehold = async (target: Household) => {
    if (!pet || movingHousehold) return;
    const from = pet.household_id;
    const fromName = households.find((h) => h.id === from)?.name ?? 'its current household';

    // A guide that also covers pets staying behind cannot travel with this
    // pet, and moving the pet out from under it would break it. Say so
    // instead — refusing is recoverable, a broken guide is not.
    const blocking = attachedGuides.filter((g) =>
      survivingPetIds(g).some((id) => id !== petId)
    );
    if (blocking.length > 0) {
      showAlert(
        `${pet.name} is in a shared guide`,
        `${blocking.map((g) => g.title).join(', ')} ${
          blocking.length === 1 ? 'also covers' : 'also cover'
        } pets that would stay in ${fromName}. Take ${pet.name} out of ${
          blocking.length === 1 ? 'that guide' : 'those guides'
        } first, then move them.`
      );
      return;
    }

    const travelling = attachedGuides;
    const ok = await showConfirm({
      title: `Move ${pet.name} to ${target.name}?`,
      message:
        `Everyone in ${target.name} will see ${pet.name}, and anyone in ${fromName} who isn't in ${target.name} will stop seeing them.` +
        (travelling.length === 0
          ? ''
          : ` ${travelling.length === 1 ? 'Their guide moves' : `Their ${travelling.length} guides move`} too.`),
      confirmLabel: 'Move',
    });
    if (!ok) return;

    setMovingHousehold(true);
    let petMoved = false;
    const moved: Guide[] = [];
    try {
      // Pet first: moving a guide while its pet is still in the old household
      // is exactly what the validation trigger rejects.
      await updatePet(petId, { household_id: target.id });
      petMoved = true;
      for (const guide of travelling) {
        // pet_ids travels pruned: the trigger revalidates every id against the
        // guide's NEW household, and a ghost id resolves in neither, so sending
        // the stored list verbatim would have the move rejected here.
        await updateGuide(guide.id, {
          household_id: target.id,
          pet_ids: survivingPetIds(guide),
        });
        moved.push(guide);
      }
      showAlert('Moved', `${pet.name} is now shared with ${target.name}.`);
    } catch (error: any) {
      const message = error?.message || 'Something went wrong. Please try again.';
      if (!petMoved || !from) {
        showAlert('Could not move', message);
        return;
      }
      // Half done. Put it back — pet first again, since a guide can only
      // return to a household that already holds its pets.
      let rolledBackPet = false;
      try {
        await updatePet(petId, { household_id: from });
        rolledBackPet = true;
        for (const guide of moved) {
          await updateGuide(guide.id, { household_id: from, pet_ids: survivingPetIds(guide) });
        }
        showAlert('Could not move', `${message} Nothing was changed.`);
      } catch {
        // Both directions failed — almost always because the connection is
        // gone. Either the pet never came back and its guides didn't follow it
        // out, or the rollback's pet write landed and some guides are stranded
        // in the target; `rolledBackPet` says which, because the alert must not
        // send the user to the wrong household to look for their pet. Either
        // way pet and guides disagree, which is exactly the state the "Finish
        // the move" control below detects: it appears on this screen as soon as
        // this alert is dismissed, because the pet's household already landed
        // in context state and the guides' did not. Never a dead end.
        showAlert(
          'Move only half finished',
          rolledBackPet
            ? `${pet.name} is back in ${fromName}, but some guides are still in ${target.name}. Tap "Finish the move" when you're back online.`
            : `${pet.name} is in ${target.name} now, but not every guide could follow. Tap "Finish the move" when you're back online.`
        );
      }
    } finally {
      setMovingHousehold(false);
    }
  };

  /** Repair for an interrupted move: bring the stragglers to the pet. */
  const handleFinishMove = async () => {
    if (!pet || movingHousehold) return;
    const destination = pet.household_id;
    if (!destination) return;
    setMovingHousehold(true);
    try {
      for (const guide of strayGuides) {
        // Pruned for the same reason the outbound move prunes: the trigger
        // revalidates the stored pet_ids against `destination`, so a ghost id
        // would have the repair rejected and strand the guide permanently.
        await updateGuide(guide.id, {
          household_id: destination,
          pet_ids: survivingPetIds(guide),
        });
      }
      showAlert(
        'Move finished',
        `${pet.name}'s ${strayGuides.length === 1 ? 'guide is' : 'guides are'} back with them.`
      );
    } catch (error: any) {
      showAlert('Could not finish', error?.message || 'Something went wrong. Please try again.');
    } finally {
      setMovingHousehold(false);
    }
  };

  // Hold the spinner on a deep-link hard reload: the effect runs against
  // empty pet arrays before DataContext's initial fetch resolves, and the
  // not-found state must wait for real data.
  if (loading || (!pet && loadingPets)) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!pet) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500 mb-4">Pet not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  const photoUrl = displayablePhotoUrl(pet.photo_url);

  // Which household actually holds this pet. Worth saying out loud only once
  // the user belongs to more than one — before that there is nothing to
  // confuse it with. Without it, a pet created while the default pointed at
  // the wrong household looks identical to a shared one, and the owner is
  // left guessing why their family can't see it.
  const owningHousehold = households.find((h) => h.id === pet.household_id);
  // Every household this pet could move TO. The rule used to be "the default,
  // and only if the pet isn't already in it", which left the exact cohort
  // migration 0011 hands to the UI with no way out: a stranded user whose pet
  // landed in their own household and whose family's household is the other
  // one. The header named the problem and offered no button. Any household
  // that isn't the current one is a legitimate destination.
  // canEdit-gated: `households` holds the CALLER's households, so for a sitter
  // viewing a client's pet every entry is a household the client has nothing to
  // do with — the screen would offer to move their dog into the sitter's own
  // home. RLS refuses it (the UPDATE policy tests the pet's CURRENT household),
  // but the offer should never appear.
  const moveTargets = canEdit && pet.household_id
    ? households.filter((h) => h.id !== pet.household_id)
    : [];
  // One destination needs no choosing; several open the picker below.
  const soleMoveTarget = moveTargets.length === 1 ? moveTargets[0] : undefined;

  // Section gating — only render sections that actually have content.
  const hasBasics = !!(
    (pet.sex && pet.sex !== 'unknown') ||
    pet.is_neutered ||
    // != null, matching the Weight row below: a weight of 0 is a real value,
    // and a truthiness gate would skip the section that renders it.
    pet.weight != null ||
    pet.color_markings ||
    pet.nicknames
  );
  const hasIdentification = !!(pet.microchip_id || pet.license_tag);
  const personality = pet.personality;
  const hasPersonality =
    !!personality && Object.values(personality).some((v) => !!v);
  const hasHealthVet = !!(pet.vet_info || pet.medical_notes);
  const enabledSymptoms =
    pet.health_protocol?.symptoms.filter((s) => s.is_enabled) ?? [];
  const hasHealthProtocol = !!(
    pet.health_protocol &&
    (enabledSymptoms.length > 0 ||
      pet.health_protocol.general_notes ||
      pet.health_protocol.vet_call_threshold)
  );
  const hasNotes = !!(pet.behavioral_notes || pet.special_instructions);

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            <Button title="Home" onPress={() => navigation.navigate('Home')} variant="outline" />
          </View>

          {/* Pet identity */}
          <View className="items-center pb-6">
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                className="w-28 h-28 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-28 h-28 rounded-full bg-tan-100 items-center justify-center">
                {/* 60, not 68: the delivered masters top out at 96px, and the
                    brand inventory specs these avatars for 48-60px renders.
                    68pt would upsample the source at @2x and above. */}
                <Icon name={speciesIconName(pet.species)} size={60} />
              </View>
            )}
            <Text className="text-2xl font-bold text-brown-800 mt-4">{pet.name}</Text>
            {pet.nicknames && (
              <Text className="text-tan-400 text-sm">"{pet.nicknames}"</Text>
            )}
            <Text className="text-tan-500 capitalize">
              {pet.breed || pet.species}
              {pet.age != null && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
            </Text>
            {pet.status === 'deceased' && (
              <View className="bg-tan-100 px-3 py-1 rounded-full mt-2">
                <Text className="text-tan-500 text-sm">In Memorial</Text>
              </View>
            )}

            {/* Who can see this pet, and how to change it. Nothing else in the
                app says which household an EXISTING pet belongs to, so a pet
                that landed in the wrong one is invisible until someone asks
                why their family can't see it. */}
            {(owningHousehold || strayGuides.length > 0) && households.length > 1 && (
              <View className="items-center mt-2">
                {owningHousehold && (
                  <Text className="text-tan-500 text-sm">
                    {`Shared with ${owningHousehold.name}`}
                  </Text>
                )}
                {strayGuides.length > 0 ? (
                  <Pressable
                    onPress={handleFinishMove}
                    disabled={movingHousehold}
                    accessibilityRole="button"
                    accessibilityLabel={`Finish the move: bring ${pet.name}'s guides to ${
                      owningHousehold?.name ?? 'this household'
                    }`}
                    accessibilityState={{ disabled: movingHousehold, busy: movingHousehold }}
                    className="bg-primary-50 px-3 py-1.5 rounded mt-2"
                    style={{ opacity: movingHousehold ? 0.5 : 1 }}
                  >
                    {movingHousehold ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text className="text-primary-600 text-sm font-medium">
                        {`Finish the move${
                          strayGuides.length === 1 ? '' : ` (${strayGuides.length} guides)`
                        }`}
                      </Text>
                    )}
                  </Pressable>
                ) : moveTargets.length > 0 ? (
                  <>
                    <Pressable
                      onPress={() =>
                        soleMoveTarget
                          ? handleMoveHousehold(soleMoveTarget)
                          : setChoosingTarget((open) => !open)
                      }
                      disabled={movingHousehold}
                      accessibilityRole="button"
                      accessibilityLabel={
                        soleMoveTarget
                          ? `Move ${pet.name} to ${soleMoveTarget.name}`
                          : `Move ${pet.name} to another household`
                      }
                      accessibilityState={{
                        disabled: movingHousehold,
                        busy: movingHousehold,
                        expanded: !soleMoveTarget ? choosingTarget : undefined,
                      }}
                      className="bg-primary-50 px-3 py-1.5 rounded mt-2"
                      style={{ opacity: movingHousehold ? 0.5 : 1 }}
                    >
                      {movingHousehold ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Text className="text-primary-600 text-sm font-medium">
                          {soleMoveTarget ? `Move to ${soleMoveTarget.name}` : 'Move to…'}
                        </Text>
                      )}
                    </Pressable>

                    {/* Destination list, expanded in place rather than in a
                        Modal of its own: picking one goes straight into
                        handleMoveHousehold's confirm dialog, and dismissing
                        one native Modal to present another in the same commit
                        is exactly how a dialog gets dropped on iOS. */}
                    {choosingTarget && !movingHousehold && (
                      <View className="self-stretch gap-2 mt-2">
                        {moveTargets.map((target) => (
                          <Pressable
                            key={target.id}
                            onPress={() => {
                              setChoosingTarget(false);
                              handleMoveHousehold(target);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${pet.name} to ${target.name}`}
                            className="bg-cream-50 border border-primary-200 px-3 py-1.5 rounded"
                          >
                            <Text className="text-primary-600 text-sm font-medium text-center">
                              {target.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                ) : null}
              </View>
            )}
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="content">
          {/* Primary action */}
          <View className="mb-4">
            {canEdit ? <Button title="Edit Pet" onPress={handleEdit} variant="primary" /> : null}
          </View>

          {/* Basics */}
          {hasBasics && (
            <SectionHeader title="Basics" icon="🐾">
              <View className="gap-2">
                {pet.sex && pet.sex !== 'unknown' && (
                  <InfoRow label="Sex" value={pet.sex === 'male' ? 'Male' : 'Female'} />
                )}
                {pet.is_neutered && <InfoRow label="Fixed" value="Spayed/Neutered" />}
                {pet.weight != null && (
                  <InfoRow label="Weight" value={`${pet.weight} ${pet.weight_unit || 'lbs'}`} />
                )}
                {pet.color_markings && <InfoRow label="Color" value={pet.color_markings} />}
                {pet.nicknames && <InfoRow label="Nicknames" value={pet.nicknames} />}
              </View>
            </SectionHeader>
          )}

          {/* Identification */}
          {hasIdentification && (
            <SectionHeader title="Identification" icon="🪪">
              <View className="gap-2">
                {pet.microchip_id && <InfoRow label="Microchip" value={pet.microchip_id} />}
                {pet.license_tag && <InfoRow label="License" value={pet.license_tag} />}
              </View>
            </SectionHeader>
          )}

          {/* Personality */}
          {hasPersonality && personality && (
            <SectionHeader title="Personality" icon="🎾">
              <View className="gap-2">
                {personality.energy_level && (
                  <InfoRow label="Energy" value={titleCase(personality.energy_level)} />
                )}
                {personality.sociability_people && (
                  <InfoRow label="With People" value={titleCase(personality.sociability_people)} />
                )}
                {personality.sociability_pets && (
                  <InfoRow label="With Pets" value={titleCase(personality.sociability_pets)} />
                )}
                {personality.fears && <InfoRow label="Fears" value={personality.fears} />}
                {personality.bad_habits && (
                  <InfoRow label="Bad Habits" value={personality.bad_habits} />
                )}
                {personality.comfort_items && (
                  <InfoRow label="Comforts" value={personality.comfort_items} />
                )}
                {personality.favorite_toys && (
                  <InfoRow label="Toys" value={personality.favorite_toys} />
                )}
                {personality.known_commands && (
                  <InfoRow label="Commands" value={personality.known_commands} />
                )}
              </View>
            </SectionHeader>
          )}

          {/* Feeding Schedule */}
          {pet.feeding_schedule.length > 0 && (
            <SectionHeader title="Feeding Schedule" icon="🍽️">
              {pet.feeding_schedule.map((schedule, index) => (
                <View
                  key={schedule.id}
                  className={`pb-3 ${
                    index < pet.feeding_schedule.length - 1
                      ? 'border-b border-tan-200 mb-3'
                      : ''
                  }`}
                >
                  <View className="flex-row justify-between">
                    <Text className="font-medium text-brown-800">{schedule.time}</Text>
                    <Text className="text-tan-500">{schedule.amount}</Text>
                  </View>
                  <Text className="text-tan-600">{schedule.food_type}</Text>
                  {schedule.notes && (
                    <Text className="text-tan-400 text-sm mt-1">{schedule.notes}</Text>
                  )}
                </View>
              ))}
            </SectionHeader>
          )}

          {/* Medications */}
          {pet.medications.length > 0 && (
            <SectionHeader title="Medications" icon="💊">
              {pet.medications.map((med, index) => (
                <View
                  key={med.id}
                  className={`pb-3 ${
                    index < pet.medications.length - 1
                      ? 'border-b border-tan-200 mb-3'
                      : ''
                  }`}
                >
                  <Text className="font-medium text-brown-800">{med.name}</Text>
                  <Text className="text-tan-600">
                    {med.dosage} - {med.frequency}
                  </Text>
                  {med.times && med.times.filter((t) => t).length > 0 && (
                    <Text className="text-tan-400 text-sm">
                      {med.times.filter((t) => t).length === 1 ? 'Time' : 'Times'}:{' '}
                      {med.times.filter((t) => t).join(', ')}
                    </Text>
                  )}
                  {med.with_food && (
                    <Text className="text-tan-400 text-sm">Give with food</Text>
                  )}
                  {med.notes && (
                    <Text className="text-tan-400 text-sm mt-1">{med.notes}</Text>
                  )}
                </View>
              ))}
            </SectionHeader>
          )}

          {/* Health & Vet */}
          {hasHealthVet && (
            <SectionHeader title="Health & Vet" icon="🏥">
              <View className="gap-2">
                {pet.vet_info && (
                  <>
                    {pet.vet_info.name && <InfoRow label="Vet" value={pet.vet_info.name} />}
                    {pet.vet_info.clinic && (
                      <InfoRow label="Clinic" value={pet.vet_info.clinic} />
                    )}
                    {pet.vet_info.phone && (
                      <PhoneRow label="Phone" phone={pet.vet_info.phone} />
                    )}
                    {pet.vet_info.address && (
                      <InfoRow label="Address" value={pet.vet_info.address} />
                    )}
                    {pet.vet_info.emergency_phone && (
                      <PhoneRow label="Emergency" phone={pet.vet_info.emergency_phone} />
                    )}
                  </>
                )}
                {pet.medical_notes && (
                  <View className={pet.vet_info ? 'mt-2' : ''}>
                    <Text className="text-tan-500">Medical Notes:</Text>
                    <Text className="text-brown-800">{pet.medical_notes}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Insurance */}
          {pet.insurance && (
            <SectionHeader title="Insurance" icon="🛡️">
              <View className="gap-2">
                {pet.insurance.provider && (
                  <InfoRow label="Provider" value={pet.insurance.provider} />
                )}
                {pet.insurance.policy_number && (
                  <InfoRow label="Policy #" value={pet.insurance.policy_number} />
                )}
                {pet.insurance.claims_phone && (
                  <PhoneRow label="Claims" phone={pet.insurance.claims_phone} />
                )}
                {pet.insurance.coverage_notes && (
                  <View className="mt-2">
                    <Text className="text-tan-500">Coverage:</Text>
                    <Text className="text-brown-800">{pet.insurance.coverage_notes}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Health Protocol */}
          {hasHealthProtocol && pet.health_protocol && (
            <SectionHeader title="Health Protocol" icon="🚨">
              {enabledSymptoms.length > 0 && (
                <>
                  <View className="bg-warm-50 p-3 rounded-lg mb-3 border border-warm-200">
                    <Text className="text-warm-800 text-sm font-medium">
                      {pet.health_protocol.vet_call_threshold ||
                        'Call the vet if you notice any of these symptoms:'}
                    </Text>
                  </View>
                  {enabledSymptoms.map((symptom, index) => (
                    <View
                      key={symptom.id}
                      className={`py-2 ${
                        index < enabledSymptoms.length - 1 ? 'border-b border-tan-200' : ''
                      }`}
                    >
                      <Text className="text-brown-800 font-medium">{symptom.name}</Text>
                      {symptom.notes && (
                        <Text className="text-tan-500 text-sm mt-1">{symptom.notes}</Text>
                      )}
                    </View>
                  ))}
                </>
              )}
              {enabledSymptoms.length === 0 && pet.health_protocol.vet_call_threshold && (
                <View className="bg-warm-50 p-3 rounded-lg border border-warm-200">
                  <Text className="text-warm-800 text-sm font-medium">
                    {pet.health_protocol.vet_call_threshold}
                  </Text>
                </View>
              )}
              {pet.health_protocol.general_notes && (
                <View className="mt-3 pt-3 border-t border-tan-200">
                  <Text className="text-tan-500 text-sm">Additional Notes:</Text>
                  <Text className="text-brown-800">{pet.health_protocol.general_notes}</Text>
                </View>
              )}
            </SectionHeader>
          )}

          {/* Notes */}
          {hasNotes && (
            <SectionHeader title="Notes" icon="📝">
              <View className="gap-2">
                {pet.behavioral_notes && (
                  <View>
                    <Text className="text-tan-500">Behavioral Notes:</Text>
                    <Text className="text-brown-800">{pet.behavioral_notes}</Text>
                  </View>
                )}
                {pet.special_instructions && (
                  <View className={pet.behavioral_notes ? 'mt-2' : ''}>
                    <Text className="text-tan-500">Special Instructions:</Text>
                    <Text className="text-brown-800">{pet.special_instructions}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Quiet secondary actions at the bottom */}
          {/* Hidden entirely for a sitter — see canEdit. */}
          {canEdit ? (
            <View className="gap-3 mt-2 mb-8">
              {pet.status === 'active' ? (
                <Button
                  title="Move to Memorial"
                  onPress={handleMemorial}
                  variant="outline"
                />
              ) : (
                <Button
                  title="Restore from Memorial"
                  onPress={handleRestore}
                  variant="secondary"
                />
              )}
              <Button title="Delete Pet" onPress={handleDelete} variant="outline" />
            </View>
          ) : (
            <View className="mb-8" />
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
