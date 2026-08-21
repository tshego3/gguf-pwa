import type { BackendTier } from '../types';
import type { BackendOverride } from '../types/settings';

export interface TierSelectionInput {
  readonly webgpu: boolean;
  readonly isFirefox: boolean;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly override: BackendOverride;
}

// Pure decision tree, no browser API calls, so it is trivially testable
// against mocked inputs (P1-T5). Probe WebGPU first - it needs no isolation.
// Firefox's WebGPU compatibility mode is documented as significantly slower,
// so Firefox defaults to WASM unless the user explicitly overrides to webgpu.
export function selectBackendTier(input: TierSelectionInput): BackendTier {
  if (input.override !== 'auto') return input.override;

  if (input.webgpu && !input.isFirefox) return 'webgpu';

  if (input.crossOriginIsolated && input.sharedArrayBuffer) return 'wasm-mt';

  return 'wasm-st';
}
