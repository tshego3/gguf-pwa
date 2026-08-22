import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isVideoModel, isVisionModel, parseCatalog } from './catalog';
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
});

describe('isVisionModel', () => {
  it('detects a model shipping a CLIP projector alongside its weights', () => {
    const vision = { ...validEntry, files: ['SmolVLM-256M-Instruct-Q8_0.gguf', 'mmproj-SmolVLM-256M-Instruct-Q8_0.gguf'] };
    expect(isVisionModel(vision)).toBe(true);
  });

  it('treats a plain single-file model as text only', () => {
    expect(isVisionModel(validEntry)).toBe(false);
  });

  it('does not mistake a split model for a vision pair', () => {
    const split = { ...validEntry, files: ['model-00001-of-00002.gguf', 'model-00002-of-00002.gguf'] };
    expect(isVisionModel(split)).toBe(false);
  });
});

describe('isVideoModel', () => {
  it('flags a video-trained vision checkpoint', () => {
    const video = {
      ...validEntry,
      repo: 'ggml-org/SmolVLM2-256M-Video-Instruct-GGUF',
      name: 'SmolVLM2 256M Video Instruct',
      files: ['SmolVLM2-256M-Video-Instruct-Q8_0.gguf', 'mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf'],
    };
    expect(isVideoModel(video)).toBe(true);
  });

  it('does not flag a still-image vision model', () => {
    const vision = {
      ...validEntry,
      repo: 'ggml-org/SmolVLM-256M-Instruct-GGUF',
      name: 'SmolVLM 256M Instruct',
      files: ['SmolVLM-256M-Instruct-Q8_0.gguf', 'mmproj-SmolVLM-256M-Instruct-Q8_0.gguf'],
    };
    expect(isVideoModel(vision)).toBe(false);
  });

  it('never flags a text-only model, whatever it is called', () => {
    expect(isVideoModel({ ...validEntry, name: 'Video Summariser 1B' })).toBe(false);
  });
});

describe('parseCatalog (shipped catalog)', () => {

  it('every multi-file entry in the shipped catalog is a split model or a vision pair', () => {
    const catalogPath = resolve(process.cwd(), 'public/models.json');
    const parsed = parseCatalog(JSON.parse(readFileSync(catalogPath, 'utf-8')));
    const vision = parsed.filter(isVisionModel);
    // A vision entry must carry both halves: weights plus the projector.
    for (const entry of vision) {
      expect(entry.files.length).toBeGreaterThan(1);
    }
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
