import { describe, expect, it } from 'vitest';
import { selectBackendTier } from './tierSelection';

const base = {
  webgpu: false,
  isFirefox: false,
  crossOriginIsolated: false,
  sharedArrayBuffer: false,
  override: 'auto' as const,
};

describe('selectBackendTier', () => {
  it('prefers WebGPU over multi-thread WASM when both are available', () => {
    const tier = selectBackendTier({ ...base, webgpu: true, crossOriginIsolated: true, sharedArrayBuffer: true });
    expect(tier).toBe('webgpu');
  });

  it('falls back to multi-thread WASM when isolated but WebGPU is unavailable', () => {
    const tier = selectBackendTier({ ...base, crossOriginIsolated: true, sharedArrayBuffer: true });
    expect(tier).toBe('wasm-mt');
  });

  it('falls back to single-thread WASM when neither WebGPU nor isolation is available', () => {
    const tier = selectBackendTier(base);
    expect(tier).toBe('wasm-st');
  });

  it('defaults Firefox to WASM even when WebGPU is available', () => {
    const tier = selectBackendTier({ ...base, webgpu: true, isFirefox: true });
    expect(tier).toBe('wasm-st');
  });

  it('lets Firefox opt into WebGPU via an explicit override', () => {
    const tier = selectBackendTier({ ...base, webgpu: true, isFirefox: true, override: 'webgpu' });
    expect(tier).toBe('webgpu');
  });

  it('requires both crossOriginIsolated and SharedArrayBuffer for multi-thread WASM', () => {
    const tier = selectBackendTier({ ...base, crossOriginIsolated: true, sharedArrayBuffer: false });
    expect(tier).toBe('wasm-st');
  });

  it('respects a manual override regardless of detected capabilities', () => {
    const tier = selectBackendTier({ ...base, webgpu: true, override: 'wasm-st' });
    expect(tier).toBe('wasm-st');
  });
});
