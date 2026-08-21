export type BackendTier = 'webgpu' | 'wasm-mt' | 'wasm-st';

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
