import type { CatalogModel } from '../types';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isCatalogModel(value: unknown): value is CatalogModel {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.repo === 'string' &&
    isStringArray(v.files) &&
    v.files.length > 0 &&
    typeof v.params === 'string' &&
    typeof v.quant === 'string' &&
    typeof v.bytes === 'number' &&
    v.bytes > 0 &&
    typeof v.contextLength === 'number' &&
    typeof v.licence === 'string' &&
    typeof v.licenceUrl === 'string' &&
    typeof v.minDeviceMemoryGb === 'number'
  );
}

// Derived, not declared: a vision model is one shipping a CLIP projector
// alongside its weights, and wllama identifies that file by sniffing
// `general.architecture=clip` from the GGUF header at load time. Reading the
// same fact off the filename here lets the catalog say so before the
// download, without a hand-maintained flag that could disagree with the
// bytes actually fetched.
export function isVisionModel(model: CatalogModel): boolean {
  return model.files.some((file) => /(^|\/)mmproj[-_.]/i.test(file));
}

// Video capability is not a separate GGUF feature - the runtime has no
// video modality at all, and a clip is sent as sampled frames through the
// same projector an image uses. What actually differs is training: only a
// video-trained checkpoint reasons over a frame sequence rather than
// treating each frame in isolation. Vendors mark that in the model name,
// which is the only signal available before download.
export function isVideoModel(model: CatalogModel): boolean {
  return isVisionModel(model) && /video/i.test(`${model.repo} ${model.name}`);
}

// Pure parser, independently testable against fixtures - the fetch itself
// is a thin I/O wrapper below.
export function parseCatalog(json: unknown): readonly CatalogModel[] {
  if (!Array.isArray(json)) {
    throw { type: 'load', message: 'Catalog is not an array.' };
  }
  const invalidIndex = json.findIndex((entry) => !isCatalogModel(entry));
  if (invalidIndex !== -1) {
    throw { type: 'load', message: `Catalog entry at index ${invalidIndex} is malformed.` };
  }
  return json as CatalogModel[];
}

export async function fetchCatalog(): Promise<readonly CatalogModel[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}models.json`);
  if (!response.ok) {
    throw { type: 'download', message: 'Could not load the model catalog.', status: response.status };
  }
  const json: unknown = await response.json();
  return parseCatalog(json);
}
