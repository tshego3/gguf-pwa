import { describe, expect, it } from 'vitest';
import { parseModelDetail, toCatalogModel } from './huggingfaceSearch';

describe('parseModelDetail', () => {
  it('keeps only .gguf siblings and reads their real byte size', () => {
    const detail = parseModelDetail('Qwen/Qwen3-0.6B-GGUF', {
      siblings: [
        { rfilename: 'README.md', size: 100 },
        { rfilename: 'Qwen3-0.6B-Q8_0.gguf', size: 639446688 },
        { rfilename: 'Qwen3-0.6B-Q4_K_M.gguf', size: 396705472 },
      ],
      cardData: { license: 'apache-2.0' },
    });
    expect(detail.licence).toBe('apache-2.0');
    expect(detail.ggufFiles).toEqual([
      { name: 'Qwen3-0.6B-Q8_0.gguf', bytes: 639446688 },
      { name: 'Qwen3-0.6B-Q4_K_M.gguf', bytes: 396705472 },
    ]);
  });

  it('falls back to the repo page when no explicit licence link is given', () => {
    const detail = parseModelDetail('org/repo', { siblings: [], cardData: {} });
    expect(detail.licenceUrl).toBe('https://huggingface.co/org/repo');
    expect(detail.licence).toContain('verify');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseModelDetail('org/repo', null)).toThrow();
  });
});

describe('toCatalogModel', () => {
  it('builds a CatalogModel that carries a stable, source-tagged id', () => {
    const model = toCatalogModel(
      { id: 'Qwen/Qwen3-0.6B-GGUF', licence: 'apache-2.0', licenceUrl: 'https://x', ggufFiles: [] },
      { name: 'Qwen3-0.6B-Q4_K_M.gguf', bytes: 396705472 },
    );
    expect(model.id).toBe('hf:Qwen/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q4_K_M.gguf');
    expect(model.repo).toBe('Qwen/Qwen3-0.6B-GGUF');
    expect(model.files).toEqual(['Qwen3-0.6B-Q4_K_M.gguf']);
    expect(model.name).toBe('Qwen3-0.6B-Q4_K_M');
    expect(model.quant).toBe('Q4_K_M');
    expect(model.bytes).toBe(396705472);
  });

  it('estimates a higher device-memory floor for a larger file', () => {
    const small = toCatalogModel(
      { id: 'a/b', licence: '', licenceUrl: '', ggufFiles: [] },
      { name: 'small-Q4_0.gguf', bytes: 300 * 1024 ** 2 },
    );
    const large = toCatalogModel(
      { id: 'a/b', licence: '', licenceUrl: '', ggufFiles: [] },
      { name: 'large-Q8_0.gguf', bytes: 1000 * 1024 ** 2 },
    );
    expect(small.minDeviceMemoryGb).toBeLessThan(large.minDeviceMemoryGb);
  });
});
