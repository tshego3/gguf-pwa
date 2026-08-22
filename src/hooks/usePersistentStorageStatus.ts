import { useCallback, useEffect, useState } from 'react';
import { isStoragePersisted, requestPersistentStorage } from '../models/persistentStorage';

export interface PersistentStorageState {
  readonly persisted: boolean | null;
  readonly isRequesting: boolean;
  // True once a request came back denied, so the UI can explain rather than
  // leave the button looking like it did nothing.
  readonly wasDenied: boolean;
  readonly request: () => Promise<void>;
}

export function usePersistentStorageStatus(): PersistentStorageState {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [wasDenied, setWasDenied] = useState(false);

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
    setWasDenied(false);
    try {
      const granted = await requestPersistentStorage();
      setPersisted(granted);
      setWasDenied(!granted);
    } finally {
      setIsRequesting(false);
    }
  }, []);

  return { persisted, isRequesting, wasDenied, request };
}
