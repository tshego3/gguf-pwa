import { useEffect, useState } from 'react';
import { isStoragePersisted } from '../models/persistentStorage';

export function usePersistentStorageStatus(): boolean | null {
  const [persisted, setPersisted] = useState<boolean | null>(null);

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

  return persisted;
}
