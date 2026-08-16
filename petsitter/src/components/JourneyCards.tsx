import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from './Card';
import { Button } from './Button';
import { useData } from '../contexts';
import { showAlert } from '../lib/dialogs';
import { getActiveJourney, isCardComplete } from '../lib/journeys';
import type { JourneyCard, JourneyData, JourneyDef, JourneySurface } from '../lib/journeys';
import type { JourneyEntry } from '../types';
import type { MainStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface JourneyCardsProps {
  /**
   * Which home screen is rendering this — see JourneySurface. Defaults to the
   * owner's Home, so the existing call site keeps its exact behaviour.
   */
  surface?: JourneySurface;
}

/**
 * Renders at most ONE active journey (contract C4) as a dismissible Card on a
 * home screen: founder-welcome as a live checklist, joiner-welcome and
 * sitter-welcome as one-at-a-time card sequences. Renders null when no journey
 * is active for this surface.
 *
 * Evaluation is pure and render-time; settings writes happen ONLY on explicit
 * user action (CTA tap / Dismiss / Got it) or the one-time silent auto-done,
 * each guarded by refs so a write can never re-trigger itself into a loop.
 */
export function JourneyCards({ surface = 'owner' }: JourneyCardsProps) {
  const {
    activePets,
    guides,
    loadingPets,
    petsError,
    loadingGuides,
    guidesError,
    householdsLoading,
    householdsError,
    primaryHouseholdId,
    primaryHouseholdMemberCount,
    settings,
    loadingSettings,
    journeysState,
    setJourneyState,
    setJourneyStates,
    setJourneyCardComplete,
  } = useData();
  const navigation = useNavigation<NavigationProp>();

  // How each journey's FIRST settled evaluation this session classified it:
  // 'auto-done' (all predicate cards already true — never show) or 'shown'
  // (rendered at least once, so later completion celebrates instead).
  const evaluatedRef = useRef<Record<string, 'shown' | 'auto-done'>>({});
  // One-shot guards so the silent auto-done / celebration writes fire once.
  const autoDoneWriteRef = useRef<Set<string>>(new Set());
  const celebratedRef = useRef<Set<string>>(new Set());
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const active = useMemo(
    () => getActiveJourney(journeysState, surface),
    [journeysState, surface]
  );

  // Never evaluate predicates against half-loaded data: a settled evaluation
  // needs pets, guides, settings, AND the member count (which DataContext
  // lazily fetches once whenever a journey is pending; solo users without a
  // primary household count as 1).
  // A FAILED fetch leaves the arrays empty and clears the loading flag, which
  // is indistinguishable from "this user has no pets" — and would show an
  // established household the "Add your first pet" checklist (worse, latch
  // that classification for the whole session). Treat an errored load as
  // still unsettled and render nothing until it succeeds.
  const dataSettled =
    !loadingSettings &&
    settings != null &&
    !loadingPets &&
    !petsError &&
    !loadingGuides &&
    !guidesError &&
    !householdsLoading &&
    !householdsError;
  const memberCount = primaryHouseholdId == null ? 1 : primaryHouseholdMemberCount;
  // Only a founder-welcome predicate ever reads the member count, and
  // DataContext fetches it lazily only while an OWNER journey is pending — on
  // the sitter surface it therefore stays null forever, and waiting for it
  // would mean sitter-welcome never renders. Keyed on the surface rather than
  // on the active journey's cards so the owner path's timing is untouched.
  const evaluable = dataSettled && (surface === 'sitter' || memberCount != null);

  const journeyData: JourneyData = useMemo(
    () => ({ activePets, guides, householdMemberCount: memberCount ?? 1 }),
    [activePets, guides, memberCount]
  );

  const entry: JourneyEntry | undefined = active ? journeysState[active.key] : undefined;
  const predicateCards = active ? active.cards.filter((c) => c.isComplete) : [];
  // Vacuous truth guard: a journey with NO predicate cards (joiner-welcome)
  // must never silently auto-complete.
  const predicateCardsDone =
    predicateCards.length > 0 && predicateCards.every((c) => c.isComplete!(journeyData));
  const allCardsDone =
    active != null && active.cards.every((c) => isCardComplete(c, entry, journeyData));

  // First settled evaluation: classify once per journey per session. If every
  // predicate card is already true, record 'done' silently (C2) — the render
  // guards below keep the journey from ever flashing.
  useEffect(() => {
    if (!evaluable || !active) return;
    const key = active.key;
    if (evaluatedRef.current[key]) return; // already classified this session
    if (predicateCardsDone) {
      evaluatedRef.current[key] = 'auto-done';
      if (!autoDoneWriteRef.current.has(key)) {
        autoDoneWriteRef.current.add(key);
        setJourneyState(key, 'done').catch((err) =>
          console.error('Failed to auto-complete journey:', err)
        );
      }
    } else {
      evaluatedRef.current[key] = 'shown';
    }
  }, [evaluable, active, predicateCardsDone, setJourneyState]);

  // Interactive completion (founder checklist finished while visible):
  // record 'done' and show a brief "You're all set" state that auto-hides.
  useEffect(() => {
    if (!evaluable || !active || active.key !== 'founder-welcome') return;
    const key = active.key;
    if (evaluatedRef.current[key] !== 'shown') return;
    if (!allCardsDone || celebratedRef.current.has(key)) return;
    celebratedRef.current.add(key);
    setCelebrating(key);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrating(null), 3500);
    setJourneyState(key, 'done').catch((err) => {
      // Release the guard so a later render can retry. Without this a
      // transient write failure left an all-ticked checklist parked on Home
      // forever: every card done, nothing left to tap, and the completion
      // path permanently short-circuited.
      console.error('Failed to complete journey:', err);
      celebratedRef.current.delete(key);
    });
  }, [evaluable, active, allCardsDone, setJourneyState]);

  useEffect(
    () => () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    []
  );

  const handleCta = (def: JourneyDef, card: JourneyCard) => {
    if (!card.cta) return;
    if (!card.isComplete) {
      // Predicate-less card: the CTA tap itself completes it. Fire and forget
      // so navigation never waits on the settings write.
      setJourneyCardComplete(def.key, card.id).catch((err) =>
        console.error('Failed to record journey card:', err)
      );
    }
    // The registry types `screen` as keyof MainStackParamList, so the route
    // name is checked at compile time. navigate()'s overloads can't express
    // "some route, with its params" generically, hence the tuple cast.
    navigation.navigate(
      ...([card.cta.screen, card.cta.params] as unknown as Parameters<
        typeof navigation.navigate
      >)
    );
  };

  const handleDismiss = async (def: JourneyDef) => {
    setDismissing(true);
    try {
      if (def.key === 'founder-welcome') {
        // Dismissing the founder checklist means "no welcome tour, thanks" —
        // settle joiner-welcome too so it doesn't pop up in its place. Real
        // joiners still see it: the invite gate (C5) skips ONLY
        // founder-welcome, without ever rendering this checklist. Both skips
        // land in ONE settings write: two sequential writes rendered the
        // joiner card during the second round-trip, and left it permanently
        // pending if that second write failed.
        await setJourneyStates({
          'founder-welcome': 'skipped',
          'joiner-welcome': 'skipped',
        });
      } else {
        await setJourneyState(def.key, 'skipped');
      }
    } catch (err: any) {
      showAlert('Error', err?.message || 'Could not dismiss this right now.');
    } finally {
      setDismissing(false);
    }
  };

  const handleTourFinish = async (def: JourneyDef) => {
    try {
      await setJourneyState(def.key, 'done');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Could not save your progress.');
    }
  };

  // "You're all set" outlives the journey settling to 'done' (which nulls
  // `active`), so check it first.
  if (celebrating) {
    return (
      <Card className="mb-4 bg-primary-50 border-primary-200">
        <View className="items-center py-2">
          <Text className="text-3xl mb-1">🎉</Text>
          <Text className="text-brown-800 font-semibold text-lg">You're all set!</Text>
          <Text className="text-tan-500 text-center mt-1">
            Your household is ready for its first sitter.
          </Text>
        </View>
      </Card>
    );
  }

  if (!active) return null;
  const classification = evaluatedRef.current[active.key];
  if (classification === 'auto-done') return null;
  if (classification !== 'shown') {
    // Not yet classified this session. Wait for settled data, and never
    // flash a journey whose silent auto-done is about to be recorded.
    if (!evaluable) return null;
    if (predicateCardsDone) return null;
    // Falls through: the classification effect marks this render 'shown'.
  }
  // Once 'shown', keep rendering through transient refreshes (Home refocus
  // re-runs refreshHouseholds, toggling householdsLoading) — pets/guides
  // state and the cached member count stay populated, so ticks stay correct
  // and the card doesn't blink.

  if (active.key === 'joiner-welcome' || active.key === 'sitter-welcome') {
    return (
      <TourJourneyCard
        key={active.key}
        def={active}
        dismissing={dismissing}
        onDismiss={() => handleDismiss(active)}
        onFinish={() => handleTourFinish(active)}
      />
    );
  }

  return (
    <FounderJourneyCard
      key={active.key}
      def={active}
      entry={entry}
      data={journeyData}
      dismissing={dismissing}
      onCta={(card) => handleCta(active, card)}
      onDismiss={() => handleDismiss(active)}
    />
  );
}

function DismissButton({ onPress, disabled, label }: {
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      className="ml-2"
    >
      <Text className={`text-base ${disabled ? 'text-tan-300' : 'text-tan-500'}`}>✕</Text>
    </Pressable>
  );
}

/** founder-welcome: live checklist — predicates tick off as data appears. */
function FounderJourneyCard({ def, entry, data, dismissing, onCta, onDismiss }: {
  def: JourneyDef;
  entry: JourneyEntry | undefined;
  data: JourneyData;
  dismissing: boolean;
  onCta: (card: JourneyCard) => void;
  onDismiss: () => void;
}) {
  const firstIncompleteId = def.cards.find((c) => !isCardComplete(c, entry, data))?.id;

  return (
    <Card className="mb-4 bg-primary-50 border-primary-200">
      <View className="flex-row justify-between items-start mb-1">
        <Text className="text-brown-800 font-semibold flex-1">{def.title}</Text>
        <DismissButton
          onPress={onDismiss}
          disabled={dismissing}
          label="Dismiss welcome checklist"
        />
      </View>
      <Text className="text-tan-500 text-sm mb-2">
        A few steps and your first sitter can take over.
      </Text>
      {def.cards.map((card) => {
        const complete = isCardComplete(card, entry, data);
        return (
          <View key={card.id} className="flex-row items-start border-t border-primary-100 py-2.5">
            <Text
              className={`mr-2.5 text-base ${complete ? 'text-primary-500 font-bold' : 'text-tan-400'}`}
              accessibilityLabel={complete ? 'Complete' : 'Not complete'}
            >
              {complete ? '✓' : '○'}
            </Text>
            <View className="flex-1">
              <Text
                className={
                  complete ? 'text-tan-500 line-through' : 'text-brown-800 font-medium'
                }
              >
                {card.title}
              </Text>
              {!complete && (
                <Text className="text-brown-600 text-sm mt-0.5">{card.body}</Text>
              )}
              {!complete && card.cta && (
                card.id === firstIncompleteId ? (
                  <View className="mt-2 self-start">
                    <Button title={card.cta.label} onPress={() => onCta(card)} variant="primary" />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => onCta(card)}
                    accessibilityRole="button"
                    accessibilityLabel={card.cta.label}
                    hitSlop={4}
                    className="mt-1 self-start"
                  >
                    <Text className="text-primary-600 font-semibold text-sm">
                      {card.cta.label} →
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * joiner-welcome / sitter-welcome: informational cards shown one at a time
 * with Next/Got it. Neither has a predicate card, so nothing here ticks.
 */
function TourJourneyCard({ def, dismissing, onDismiss, onFinish }: {
  def: JourneyDef;
  dismissing: boolean;
  onDismiss: () => void;
  onFinish: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const card = def.cards[Math.min(step, def.cards.length - 1)];
  const isLast = step >= def.cards.length - 1;

  // A registry entry with no cards would index to -1 and crash Home on a
  // dereference. Nothing ships that today, but a half-written future journey
  // shouldn't take the home screen down.
  if (!card) return null;

  const handleNext = async () => {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <Card className="mb-4 bg-primary-50 border-primary-200">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-brown-800 font-semibold flex-1">{def.title}</Text>
        <DismissButton onPress={onDismiss} disabled={dismissing} label="Dismiss welcome tour" />
      </View>
      <Text className="text-brown-800 font-medium mb-1">{card.title}</Text>
      <Text className="text-brown-600 mb-3">{card.body}</Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-tan-500 text-xs">
          {Math.min(step + 1, def.cards.length)} of {def.cards.length}
        </Text>
        <Button
          title={isLast ? 'Got it' : 'Next'}
          onPress={handleNext}
          loading={finishing}
          disabled={finishing || dismissing}
        />
      </View>
    </Card>
  );
}
