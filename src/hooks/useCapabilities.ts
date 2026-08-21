import { useEffect, useState } from 'react';
import { probeCapabilities } from '../engine/capabilities';
import type { EngineCapabilities } from '../types';

interface CapabilitiesState {
  readonly capabilities: EngineCapabilities | null;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
}

// Gold-standard 4-branch state, applied to a single async probe: loading
// while the promise resolves, error if the probe itself throws (it should
// not, since every internal check is guarded), data once populated.
export function useCapabilities(): CapabilitiesState {
  const [state, setState] = useState<CapabilitiesState>({
    capabilities: null,
    isLoading: true,
    errorMessage: null,
  });

  useEffect(() => {
    let cancelled = false;

    probeCapabilities()
      .then((capabilities) => {
        if (!cancelled) setState({ capabilities, isLoading: false, errorMessage: null });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            capabilities: null,
            isLoading: false,
            errorMessage: 'Could not read this browser’s capabilities.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
