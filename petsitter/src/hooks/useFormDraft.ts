import { useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showConfirm } from '../lib/dialogs';

/**
 * Keeps an in-progress create form on disk so leaving the screen cannot destroy
 * it.
 *
 * WHY THIS EXISTS
 *
 * PetForm and GuideForm both guarded unsaved work with a `beforeRemove`
 * listener, and both carried a comment claiming that "browser back, Android
 * hardware back, the header Cancel button and any programmatic goBack() all
 * funnel through beforeRemove". Three of those four are true. Browser back is
 * not: on web, React Navigation's popstate handler calls
 * `navigation.resetRoot(record.state)` (useLinking.tsx:218) — a wholesale state
 * replacement, not a dispatched action — so nothing is ever offered to
 * `beforeRemove` to veto. The listener is registered when NavigationContainer
 * mounts, long before any form screen exists, so a competing popstate listener
 * added here would always run second, after the reset has already happened.
 * There is no vetoable moment to hook.
 *
 * So stop trying to block the navigation and make it harmless instead. The
 * actual harm was never "the user navigated" — it was "thirty fields of typing
 * evaporated". A draft that survives fixes that for browser back, for a swipe
 * gesture, for a crash, and for a closed tab, none of which a confirm dialog
 * covers. The `beforeRemove` confirm stays where it does work (in-app Cancel
 * and hardware back on native), and its discard branch now clears the draft,
 * because Cancel means "I don't want this" and should be believed.
 *
 * Create mode only. Edit mode auto-saves, so there is never an unsaved edit to
 * rescue and a resume prompt would be nonsense.
 */

const PREFIX = 'pawstructions.draft';

/** Namespaced per user: a shared device must not offer one account's half-finished pet to another. */
function storageKey(kind: string, userId: string | undefined) {
  return `${PREFIX}.${kind}.${userId ?? 'anon'}`;
}

interface Options<T> {
  /** Short stable name for this form, e.g. 'pet' or 'guide'. */
  kind: string;
  /** Signed-in user id; the draft is scoped to it. */
  userId: string | undefined;
  /** False in edit mode, or before the form is ready to be trusted. */
  enabled: boolean;
  /** Current form values. Only written once `isDirty` is true. */
  value: T;
  isDirty: boolean;
  /** Called with a restored draft when the user chooses to resume. */
  onRestore: (draft: T) => void;
  /** Wording for the resume prompt, e.g. 'pet'. */
  noun: string;
}

export function useFormDraft<T>({
  kind,
  userId,
  enabled,
  value,
  isDirty,
  onRestore,
  noun,
}: Options<T>) {
  const key = storageKey(kind, userId);

  // Read through refs inside the debounce so a re-render mid-timer doesn't
  // reschedule the write or persist a value the user has already moved past.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // The resume prompt must run exactly once per mount. Without this a
  // re-render while the dialog is open queues a second identical dialog.
  const askedRef = useRef(false);
  // Set once the user has answered, so the debounced writer can't save over a
  // draft the user is still being asked about.
  const readyRef = useRef(false);
  // True while a change has been seen but not yet written. Read by the effect
  // cleanup so a flush happens only when there is something to flush.
  const pendingRef = useRef(false);

  const clear = useCallback(() => {
    readyRef.current = false;
    pendingRef.current = false;
    // Fire and forget: nothing downstream waits on the delete, and a storage
    // failure here must not block a successful save from navigating away.
    AsyncStorage.removeItem(key).catch(() => {});
  }, [key]);

  // --- offer to resume -----------------------------------------------------
  useEffect(() => {
    if (!enabled || askedRef.current) return;
    askedRef.current = true;

    let cancelled = false;
    (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(key);
      } catch {
        // An unreadable draft is not worth an error message: the user gets the
        // empty form they asked for, which is the same thing they would have
        // got before this hook existed.
      }
      if (cancelled) return;
      if (!raw) {
        readyRef.current = true;
        return;
      }

      let draft: T | null = null;
      try {
        draft = JSON.parse(raw) as T;
      } catch {
        draft = null;
      }
      if (draft == null) {
        clear();
        readyRef.current = true;
        return;
      }

      const resume = await showConfirm({
        title: `Resume unfinished ${noun}?`,
        message: `You started adding a ${noun} and didn't finish. Pick up where you left off?`,
        confirmLabel: 'Resume',
        cancelLabel: 'Start fresh',
      });
      if (cancelled) return;

      if (resume) {
        onRestoreRef.current(draft);
      } else {
        clear();
      }
      readyRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, key, noun, clear]);

  // --- persist -------------------------------------------------------------
  const writeNow = useCallback(() => {
    AsyncStorage.setItem(key, JSON.stringify(valueRef.current)).catch(() => {});
  }, [key]);

  useEffect(() => {
    if (!enabled || !isDirty || !readyRef.current) return;
    // Debounced: these forms fire on every keystroke across ~30 fields, and a
    // write per character would be a lot of disk for no extra safety.
    pendingRef.current = true;
    const timer = setTimeout(() => {
      pendingRef.current = false;
      writeNow();
    }, 600);
    return () => clearTimeout(timer);
  }, [enabled, isDirty, key, value, writeNow]);

  // Flush on the way OUT, and only there.
  //
  // The debounce above is a hole exactly where it hurts most: type a few
  // fields, hit back immediately, and the pending timer is cleared by the
  // unmount before it ever fires — so the draft holds whatever you typed
  // several seconds ago and the last thing you wrote is gone. That is the
  // precise failure this hook exists to prevent, surviving in miniature.
  //
  // Deliberately its own effect with no `value` dependency. Putting the flush
  // in the debounce effect's cleanup would fire it on every keystroke — the
  // cleanup runs on each dependency change, not just unmount — which is a
  // write per character and no debounce at all.
  //
  // Not covered here: a browser tab closed mid-keystroke, because AsyncStorage
  // is async and `beforeunload` will not wait for a promise. Both form screens
  // keep their own `beforeunload` warning for that case.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        pendingRef.current = false;
        writeNow();
      }
    };
  }, [writeNow]);

  return { clearDraft: clear };
}
