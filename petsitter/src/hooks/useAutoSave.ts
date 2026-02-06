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

  const performSave = useCallback(async () => {
    if (!enabled) return;

    setStatus('saving');
    setError(null);

    try {
      await onSave(dataRef.current);
      setStatus('saved');
      setLastSaved(new Date());

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setStatus((current) => (current === 'saved' ? 'idle' : current));
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to save');
    }
  }, [onSave, enabled]);

  // Create debounced save function
  const debouncedSave = useRef(
    debounce(() => {
      performSave();
    }, debounceMs)
  ).current;

  // Trigger save when data changes (skip first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (enabled) {
      setStatus('idle'); // Show we're waiting to save
      debouncedSave();
    }

    return () => {
      debouncedSave.cancel();
    };
  }, [data, enabled, debouncedSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
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
