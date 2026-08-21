import { describe, expect, it } from 'vitest';
import { validateGgufFile } from './validateGguf';

function bufferOf(bytes: readonly number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

const VALID_HEADER = bufferOf([
  0x47, 0x47, 0x55, 0x46, // "GGUF"
  0x03, 0x00, 0x00, 0x00, // version 3
  0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // tensor count
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // kv count
]);

describe('validateGgufFile', () => {
  it('accepts a valid GGUF header', async () => {
    const result = await validateGgufFile(new Blob([VALID_HEADER]));
    expect(result.valid).toBe(true);
  });

  it('rejects wrong magic bytes', async () => {
    const bad = bufferOf([0x00, 0x00, 0x00, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = await validateGgufFile(new Blob([bad]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/magic bytes/);
  });

  it('rejects a truncated file', async () => {
    const result = await validateGgufFile(new Blob([bufferOf([0x47, 0x47, 0x55, 0x46, 0x03, 0, 0, 0])]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/too small/);
  });

  it('rejects an empty file', async () => {
    const result = await validateGgufFile(new Blob([]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/empty/);
  });

  it('rejects an unsupported version', async () => {
    const bad = bufferOf([0x47, 0x47, 0x55, 0x46, 0x63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = await validateGgufFile(new Blob([bad]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/version/);
  });
});
