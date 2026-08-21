import type { GgufValidationResult } from '../types';

// GGUF header: 4-byte magic "GGUF", uint32 LE version, uint64 LE tensor
// count, uint64 LE metadata KV count. 24 bytes is enough to validate the
// shape without reading the (potentially huge) tensor/metadata sections.
const MAGIC = 0x46554747; // "GGUF" little-endian as uint32
const HEADER_BYTES = 24;
const MIN_SUPPORTED_VERSION = 1;
const MAX_SUPPORTED_VERSION = 3;

export async function validateGgufFile(file: Blob): Promise<GgufValidationResult> {
  if (file.size === 0) {
    return { valid: false, reason: 'The file is empty.' };
  }

  if (file.size < HEADER_BYTES) {
    return { valid: false, reason: 'The file is too small to be a valid GGUF model.' };
  }

  const headerBuffer = await file.slice(0, HEADER_BYTES).arrayBuffer();
  const view = new DataView(headerBuffer);

  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    return { valid: false, reason: 'This is not a GGUF file - the magic bytes do not match.' };
  }

  const version = view.getUint32(4, true);
  if (version < MIN_SUPPORTED_VERSION || version > MAX_SUPPORTED_VERSION) {
    return { valid: false, reason: `Unsupported GGUF version (${version}).` };
  }

  return { valid: true };
}
