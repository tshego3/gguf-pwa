import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from './catalog';
import type { CatalogModel } from '../types';

const validEntry: CatalogModel = {
  id: 'test-model',
  name: 'Test Model',
  repo: 'org/repo',
  files: ['model.gguf'],
  params: '0.6B',
  quant: 'Q4_K_M',
  bytes: 400_000_000,
  contextLength: 4096,
  licence: 'Apache-2.0',
  licenceUrl: 'https://example.com/licence',
  minDeviceMemoryGb: 4,
};

describe('parseCatalog', () => {
  it('accepts a well-formed catalog', () => {
    expect(parseCatalog([validEntry])).toEqual([validEntry]);
  });

  it('rejects a non-array payload', () => {
    expect(() => parseCatalog({})).toThrow();
  });

  it('rejects an entry missing a required field', () => {
    const { licenceUrl: _licenceUrl, ...missingLicenceUrl } = validEntry;
    expect(() => parseCatalog([missingLicenceUrl])).toThrow();
  });

  it('rejects an entry with zero bytes', () => {
    expect(() => parseCatalog([{ ...validEntry, bytes: 0 }])).toThrow();
  });

  it('parses the real public/models.json catalog shipped with the app', () => {
    const catalogPath = resolve(process.cwd(), 'public/models.json');
    const raw = readFileSync(catalogPath, 'utf-8');
    const parsed = parseCatalog(JSON.parse(raw));
    expect(parsed.length).toBeGreaterThan(0);
    for (const entry of parsed) {
      expect(entry.bytes).toBeGreaterThan(0);
      expect(entry.licenceUrl).toMatch(/^https:\/\//);
    }
  });
});
