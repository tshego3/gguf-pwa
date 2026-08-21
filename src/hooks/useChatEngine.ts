import { useEffect, useState } from 'react';
import * as engine from '../engine';
import { probeCapabilities } from '../engine/capabilities';
import { loadSettings } from '../db';
import { prepareChatModel, type PrepareChatModelResult } from '../models/prepareChatModel';
import { toUserMessage, type BackendTier, type EngineError, type InstalledModel } from '../types';

export type ChatEngineStatus =
  | 'checking'
  | 'no-model'
  | 'needs-permission'
  | 'missing'
  | 'loading-model'
  | 'ready'
  | 'error';

interface ChatEngineState {
  readonly status: ChatEngineStatus;
  readonly tier: BackendTier | null;
  readonly model: InstalledModel | null;
  readonly errorMessage: string | null;
}

const INITIAL_STATE: ChatEngineState = { status: 'checking', tier: null, model: null, errorMessage: null };

function toStatus(result: PrepareChatModelResult): ChatEngineStatus {
  if (result.status === 'none-installed') return 'no-model';
  if (result.status === 'needs-permission') return 'needs-permission';
  if (result.status === 'missing') return 'missing';
  return 'loading-model';
}

// Owns the engine's model-loading lifecycle for the whole app session - one
// model resident at a time, loaded once, independent of which conversation
// is open. Chat screens read `status` and `tier` from this; they never call
// the engine's loadModel directly.
export function useChatEngine(reloadKey: number): ChatEngineState {
  const [state, setState] = useState<ChatEngineState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setState(INITIAL_STATE);

      const prepared = await prepareChatModel();
      if (cancelled) return;

      if (prepared.status !== 'ready') {
        setState({ status: toStatus(prepared), tier: null, model: 'model' in prepared ? prepared.model : null, errorMessage: null });
        return;
      }

      setState({ status: 'loading-model', tier: null, model: prepared.model, errorMessage: null });

      try {
        const [caps, settings] = await Promise.all([probeCapabilities(), loadSettings()]);
        if (cancelled) return;

        const tier = settings.backendOverride === 'auto' ? caps.tier : settings.backendOverride;
        await engine.loadModel(prepared.blobs, { ...caps, tier }, {
          nCtx: settings.nCtx,
          temperature: settings.temperature,
          topK: settings.topK,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
          seed: null,
          systemPrompt: null,
        });
        if (cancelled) return;

        setState({ status: 'ready', tier, model: prepared.model, errorMessage: null });
      } catch (error) {
        if (cancelled) return;
        const engineError = error as EngineError;
        setState({ status: 'error', tier: null, model: prepared.model, errorMessage: engineError.message || toUserMessage(engineError) });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return state;
}
