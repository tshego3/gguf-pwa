import type { CatalogModel, Platform } from '../types';

// Provisional defaults. Real device measurements never ran (no physical
// hardware in this environment) - every number here is an estimate, not a
// measurement, and is marked so wherever it surfaces in the UI. Correcting
// these later is a data change, not a code change.

const GB = 1024 ** 3;

// Conservative recommended-size ceilings per detected device memory, per
// the plan's "seven mitigations" section. These are soft: checkModelFit
// always allows the user to proceed regardless of the result.
function recommendedMaxBytes(deviceMemoryGb: number | null): number {
  if (deviceMemoryGb === null) return 0.5 * GB;
  if (deviceMemoryGb <= 3) return 0.4 * GB;
  if (deviceMemoryGb <= 4) return 0.9 * GB;
  return 1.2 * GB;
}

export interface ModelFitCheck {
  readonly fits: boolean;
  readonly warning: string | null;
}

export function checkModelFit(model: CatalogModel, deviceMemoryGb: number | null): ModelFitCheck {
  const ceiling = recommendedMaxBytes(deviceMemoryGb);
  const modelGb = (model.bytes / GB).toFixed(2);

  if (model.bytes <= ceiling) {
    return { fits: true, warning: null };
  }

  const deviceLabel = deviceMemoryGb === null ? 'this device' : `a ${deviceMemoryGb} GB device`;
  return {
    fits: false,
    warning: `${model.name} is ${modelGb} GB. ${deviceLabel} may not have enough memory to hold it - the tab could be closed without warning. You can still continue.`,
  };
}

// n_ctx defaults per platform, per the plan's KV-cache memory guidance.
// UNVERIFIED against real memory growth (that requires P3-T11's device
// measurement pass).
const N_CTX_DEFAULTS: Record<Platform, number> = {
  ios: 2048,
  android: 4096,
  windows: 4096,
  macos: 4096,
  linux: 4096,
  unknown: 2048,
};

export function defaultNCtx(platform: Platform): number {
  return N_CTX_DEFAULTS[platform];
}

// KV cache estimate in MB: ~32 KB/token is the plan's own figure for a 1B
// model in the Llama 3.2 shape (16 layers, 8 KV heads, 64 head dim, fp16).
// Used as a rough default when a model's own architecture fields are not
// read from its GGUF metadata.
const KV_CACHE_BYTES_PER_TOKEN_DEFAULT = 32 * 1024;

export function estimateKvCacheMb(nCtx: number, bytesPerToken = KV_CACHE_BYTES_PER_TOKEN_DEFAULT): number {
  return (nCtx * bytesPerToken) / 1024 ** 2;
}
