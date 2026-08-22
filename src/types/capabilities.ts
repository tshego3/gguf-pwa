export type BackendTier = 'webgpu' | 'wasm-mt' | 'wasm-st';

// Reported by the engine once a model is loaded, read from the model's own
// GGUF rather than guessed from its name. A plain text GGUF has no vision
// projector, so supportsImage is false and the UI hides the image tool.
export interface ModelModalities {
  readonly supportsImage: boolean;
  readonly supportsAudio: boolean;
}

export const TEXT_ONLY_MODALITIES: ModelModalities = { supportsImage: false, supportsAudio: false };

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';

export interface EngineCapabilities {
  readonly tier: BackendTier;
  readonly webgpu: boolean;
  readonly webgpuMaxBufferSize: number | null;
  readonly webgpuMaxStorageBufferBindingSize: number | null;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly fileSystemAccess: boolean;
  readonly opfs: boolean;
  readonly storageQuotaBytes: number | null;
  readonly storageUsageBytes: number | null;
  readonly deviceMemoryGb: number | null;
  readonly hardwareConcurrency: number;
  readonly platform: Platform;
  readonly isFirefox: boolean;
}
