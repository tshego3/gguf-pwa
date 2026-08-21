import type { BackendTier } from '../types';
import type { EngineError } from '../types';

export interface EngineLoadParams {
  readonly nCtx: number;
  readonly tier: BackendTier;
  readonly nGpuLayers: number;
  readonly nThreads: number;
}

export interface EngineChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface EngineChatParams {
  readonly temperature: number;
  readonly topK: number;
  readonly topP: number;
  readonly maxTokens: number;
  readonly seed: number | null;
}

export type WorkerRequest =
  | { readonly id: number; readonly kind: 'load'; readonly blobs: Blob[]; readonly params: EngineLoadParams }
  | { readonly id: number; readonly kind: 'unload' }
  | { readonly id: number; readonly kind: 'chat'; readonly messages: EngineChatMessage[]; readonly params: EngineChatParams }
  | { readonly id: number; readonly kind: 'abort'; readonly targetId: number }
  | { readonly id: number; readonly kind: 'countTokens'; readonly text: string };

export type WorkerResponse =
  | { readonly id: number; readonly kind: 'loadProgress'; readonly bytesLoaded: number; readonly bytesTotal: number }
  | { readonly id: number; readonly kind: 'ok' }
  | { readonly id: number; readonly kind: 'error'; readonly error: EngineError }
  | { readonly id: number; readonly kind: 'chatToken'; readonly token: string }
  | { readonly id: number; readonly kind: 'chatDone' }
  | { readonly id: number; readonly kind: 'countTokensResult'; readonly count: number };
