import './src/global.css';

import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DECKS, deckById } from './src/core/decks';
import { DURATION_CHOICES_MS } from './src/core/round';
import type { RoundState } from './src/core/types';
import { settings } from './src/platform/services';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { LeaderboardScreen } from './src/ui/screens/LeaderboardScreen';
import { PlayScreen } from './src/ui/screens/PlayScreen';
import { ResultsScreen } from './src/ui/screens/ResultsScreen';

/**
 * Four screens, one linear flow, no back stack worth the name — so the router
 * is a tagged union rather than a navigation library. If the flow ever grows a
 * real hierarchy this is the file that gains a dependency.
 */
type Route =
  | { name: 'home' }
  | { name: 'play' }
  | { name: 'results'; state: RoundState }
  | { name: 'board' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [deckId, setDeckId] = useState(DECKS[0].id);
  const [durationMs, setDurationMs] = useState<number>(DURATION_CHOICES_MS[0]);
  const [tiltEnabled, setTiltEnabled] = useState(false);
  // Bumped on every start so PlayScreen remounts into a fresh round, and after
  // every save so the home preview refetches.
  const [runId, setRunId] = useState(0);

  // Restore the last deck and round length, so reopening the app in the next
  // queue picks up where the last one left off.
  useEffect(() => {
    let live = true;
    settings.preferences().then((prefs) => {
      if (!live) return;
      if (prefs.deckId && deckById(prefs.deckId)) setDeckId(prefs.deckId);
      if (prefs.durationMs && DURATION_CHOICES_MS.includes(prefs.durationMs as never)) {
        setDurationMs(prefs.durationMs);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const chooseDeck = useCallback(
    (nextDeckId: string) => {
      setDeckId(nextDeckId);
      void settings.setPreferences({ deckId: nextDeckId, durationMs });
    },
    [durationMs],
  );

  const chooseDuration = useCallback(
    (nextDurationMs: number) => {
      setDurationMs(nextDurationMs);
      void settings.setPreferences({ deckId, durationMs: nextDurationMs });
    },
    [deckId],
  );

  const start = useCallback(() => {
    setRunId((n) => n + 1);
    setRoute({ name: 'play' });
  }, []);

  const finish = useCallback((state: RoundState) => {
    setRoute({ name: 'results', state });
  }, []);

  const goHome = useCallback(() => {
    setRunId((n) => n + 1);
    setRoute({ name: 'home' });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {route.name === 'home' ? (
        <HomeScreen
          deckId={deckId}
          durationMs={durationMs}
          tiltEnabled={tiltEnabled}
          onSelectDeck={chooseDeck}
          onChangeDuration={chooseDuration}
          onSetTilt={setTiltEnabled}
          onStart={start}
          onOpenBoard={() => setRoute({ name: 'board' })}
          boardVersion={runId}
        />
      ) : null}

      {route.name === 'play' ? (
        <PlayScreen
          key={runId}
          deckId={deckId}
          durationMs={durationMs}
          tiltEnabled={tiltEnabled}
          onFinished={finish}
          onQuit={goHome}
        />
      ) : null}

      {route.name === 'results' ? (
        <ResultsScreen
          state={route.state}
          onPlayAgain={start}
          onHome={goHome}
        />
      ) : null}

      {route.name === 'board' ? (
        <LeaderboardScreen
          deckId={deckId}
          onSelectDeck={chooseDeck}
          onBack={goHome}
        />
      ) : null}
    </SafeAreaProvider>
  );
}
