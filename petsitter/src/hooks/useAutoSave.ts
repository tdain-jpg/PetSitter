import { useState, useEffect, useRef, useCallback } from 'react';
import debounce from 'lodash.debounce';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  saveNow: () => void;
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 1000,
  enabled = true,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track if this is the initial mount
  const isFirstRender = useRef(true);
  const dataRef = useRef(data);

  // Update the ref when data changes
  dataRef.current = data;

  // The unmount cleanup closes over the first render's props, so the flush
  // guard reads `enabled` from a ref instead.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // True while a debounced save is scheduled but has not run yet.
  const hasPendingSaveRef = useRef(false);
  // The data seen by the last trigger-effect run, so we can tell a real edit
  // from the effect merely re-running because `enabled` flipped.
  const prevDataRef = useRef<T | undefined>(undefined);
  // The exact object handed to the last onSave that resolved, so an unmount
  // flush can tell "nothing changed since the last write" from a real edit.
  const lastSavedDataRef = useRef<T | undefined>(undefined);
  const isMountedRef = useRef(true);
  const resetStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async () => {
    hasPendingSaveRef.current = false;
    if (!enabled) return;

    // Snapshot up front: `dataRef` can move on while the write is in flight.
    const snapshot = dataRef.current;

    if (isMountedRef.current) {
      setStatus('saving');
      setError(null);
    }

    try {
      await onSave(snapshot);
      lastSavedDataRef.current = snapshot;

      // An unmount flush finishes after the screen is gone — the write still
      // matters, the status updates no longer do.
      if (!isMountedRef.current) return;

      setStatus('saved');
      setLastSaved(new Date());

      // Reset to idle after 2 seconds
      if (resetStatusTimeoutRef.current) {
        clearTimeout(resetStatusTimeoutRef.current);
      }
      resetStatusTimeoutRef.current = setTimeout(() => {
        setStatus((current) => (current === 'saved' ? 'idle' : current));
      }, 2000);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setStatus('error');
      setError(err.message || 'Failed to save');
    }
  }, [onSave, enabled]);

  // Always call the LATEST performSave. The debounced function is created
  // once (ref) — invoking `performSave` directly would permanently close over
  // the first render's `enabled`/`onSave` (enabled is often false on mount,
  // e.g. GuideFormScreen edit mode), silently disabling auto-save forever.
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  // Create debounced save function
  const debouncedSave = useRef(
    debounce(() => {
      performSaveRef.current();
    }, debounceMs)
  ).current;

  // Trigger save when data changes (skip first render).
  // Deliberately no cleanup here: cancelling on every data change would throw
  // away the pending write and leave the unmount flush below with nothing to
  // do. lodash's debounce already restarts its own timer on each call, and a
  // pending call that lands after `enabled` flips false is a no-op because
  // performSave re-checks `enabled`.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevDataRef.current = data;
      return;
    }

    // This effect also re-runs when `enabled` flips (false -> true on hydrate,
    // for instance). Scheduling then would mark a phantom "pending save" with
    // no user edit behind it, which the unmount flush would faithfully write.
    const dataChanged = data !== prevDataRef.current;
    prevDataRef.current = data;
    if (!dataChanged) return;

    if (enabled) {
      setStatus('idle'); // Show we're waiting to save
      hasPendingSaveRef.current = true;
      debouncedSave();
    }
  }, [data, enabled, debouncedSave]);

  // Unmount: flush the pending save instead of dropping it, so the last few
  // keystrokes before navigating away still reach the server. `debouncedSave`
  // is ref-stable, so this cleanup only ever runs on unmount.
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (resetStatusTimeoutRef.current) {
        clearTimeout(resetStatusTimeoutRef.current);
        resetStatusTimeoutRef.current = null;
      }

      // Only flush a real, still-relevant change — otherwise every screen exit
      // would fire a redundant write.
      const shouldFlush =
        enabledRef.current &&
        hasPendingSaveRef.current &&
        dataRef.current !== lastSavedDataRef.current;

      if (shouldFlush) {
        debouncedSave.flush();
      } else {
        debouncedSave.cancel();
      }
    };
  }, [debouncedSave]);

  const saveNow = useCallback(() => {
    debouncedSave.cancel();
    performSave();
  }, [debouncedSave, performSave]);

  return {
    status,
    lastSaved,
    error,
    saveNow,
  };
}
