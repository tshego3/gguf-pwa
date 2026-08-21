import { useEffect, useState } from 'react';
import { getServiceWorkerVersion } from '../pwa/registerServiceWorker';

export function useSwVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getServiceWorkerVersion()
      .then((result) => {
        if (!cancelled) setVersion(result);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
