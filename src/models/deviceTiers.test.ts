import { describe, expect, it } from 'vitest';
import { checkModelFit, defaultNCtx, estimateKvCacheMb } from './deviceTiers';
import type { CatalogModel } from '../types';

const model: CatalogModel = {
  id: 'm',
  name: 'Test 800MB model',
  repo: 'org/repo',
  files: ['m.gguf'],
  params: '1B',
  quant: 'Q4_K_M',
  bytes: 800 * 1024 ** 2,
  contextLength: 4096,
  licence: 'Apache-2.0',
  licenceUrl: 'https://example.com',
  minDeviceMemoryGb: 4,
};

describe('checkModelFit', () => {
  it('warns, but still allows proceeding, on a 3 GB device for an 800 MB model', () => {
    const result = checkModelFit(model, 3);
    expect(result.fits).toBe(false);
    expect(result.warning).toContain('3 GB');
    expect(result.warning).not.toBeNull();
  });

  it('allows an 800 MB model on a 6 GB device with no warning', () => {
    const result = checkModelFit(model, 6);
    expect(result.fits).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('never blocks - fits=false only ever pairs with a non-null warning, not an error', () => {
    const result = checkModelFit(model, 3);
    expect(typeof result.fits).toBe('boolean');
    expect(result.fits === false ? result.warning !== null : true).toBe(true);
  });

  it('falls back to a conservative ceiling when device memory is unreported', () => {
    const result = checkModelFit(model, null);
    expect(result.fits).toBe(false);
    expect(result.warning).toContain('this device');
  });
});

describe('defaultNCtx', () => {
  it('defaults iOS lower than desktop platforms', () => {
    expect(defaultNCtx('ios')).toBeLessThan(defaultNCtx('windows'));
    expect(defaultNCtx('ios')).toBeLessThan(defaultNCtx('android'));
  });
});

describe('estimateKvCacheMb', () => {
  it('matches the plan figure of ~128 MB at 4096 tokens for a 1B-class model', () => {
    expect(estimateKvCacheMb(4096)).toBeCloseTo(128, 0);
  });

  it('matches the plan figure of ~256 MB at 8192 tokens', () => {
    expect(estimateKvCacheMb(8192)).toBeCloseTo(256, 0);
  });
});
