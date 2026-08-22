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
  // Set right before an engine.loadModel() call starts, cleared right after
  // it settles (success or a catchable failure). A tab kill mid-load skips
  // that clear, so finding this still set for the active model on next
  // launch means the previous attempt likely crashed the tab - the signal
  // useChatEngine uses to stop a silent crash-reload loop (memory-discipline
  // rule: a tab kill produces no catchable error, so recovery has to happen
  // on next launch instead).
  readonly pendingLoadModelId: string | null;
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
  pendingLoadModelId: null,
};
