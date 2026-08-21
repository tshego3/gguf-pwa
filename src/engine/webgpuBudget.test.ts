import { describe, expect, it } from 'vitest';
import { resolveGpuLayers } from './webgpuBudget';

describe('resolveGpuLayers', () => {
  it('offloads all layers when limits are unreported', () => {
    expect(resolveGpuLayers(800_000_000, null, null)).toBe(999);
  });

  it('offloads all layers when the model comfortably fits both ceilings', () => {
    expect(resolveGpuLayers(400_000_000, 2_000_000_000, 2_000_000_000)).toBe(999);
  });

  it('falls back to CPU when the model exceeds either ceiling', () => {
    expect(resolveGpuLayers(1_800_000_000, 2_000_000_000, 1_000_000_000)).toBe(0);
  });

  it('applies a safety margin rather than trusting the raw ceiling', () => {
    // 950 MB model against a 1000 MB ceiling - within the raw limit, but
    // over the 90% safety margin, so it should still fall back.
    expect(resolveGpuLayers(950_000_000, 1_000_000_000, 1_000_000_000)).toBe(0);
  });
});
