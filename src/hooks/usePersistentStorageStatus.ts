import { useCallback, useEffect, useState } from 'react';
import { isStoragePersisted, requestPersistentStorage, type PersistOutcome } from '../models/persistentStorage';

export interface PersistentStorageState {
  readonly persisted: boolean | null;
  readonly isRequesting: boolean;
  // The last answer, so the UI can explain rather than leave the button
  // looking like it did nothing. 'undecided' means the browser is still
  // showing its own prompt - Firefox does that and waits indefinitely, so
  // it must not be reported as a refusal.
  readonly lastOutcome: PersistOutcome | null;
  readonly request: () => Promise<void>;
}

export function usePersistentStorageStatus(): PersistentStorageState {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PersistOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    isStoragePersisted()
      .then((result) => {
        if (!cancelled) setPersisted(result);
      })
      .catch(() => {
        if (!cancelled) setPersisted(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    setIsRequesting(true);
    setLastOutcome(null);
    try {
      const outcome = await requestPersistentStorage();
      setLastOutcome(outcome);
      // An undecided prompt leaves the known state alone - claiming "not
      // granted" while the browser is still asking would be wrong.
      if (outcome !== 'undecided') setPersisted(outcome === 'granted');
    } finally {
      setIsRequesting(false);
    }
  }, []);

  return { persisted, isRequesting, lastOutcome, request };
}
