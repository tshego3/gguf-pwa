import type { BackendTier } from './capabilities';

export type BackendOverride = BackendTier | 'auto';

export interface AppSettings {
  readonly backendOverride: BackendOverride;
  readonly nCtx: number;
  readonly temperature: number;
  readonly topK: number;
  readonly topP: number;
  readonly maxTokens: number;
  readonly persistentStorageGranted: boolean;
  readonly activeModelId: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  backendOverride: 'auto',
  nCtx: 4096,
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxTokens: 512,
  persistentStorageGranted: false,
  activeModelId: null,
};
