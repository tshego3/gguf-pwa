import { useEffect, useState } from 'react';
import * as engine from '../engine';
import { probeCapabilities } from '../engine/capabilities';
import { loadSettings, patchSettings } from '../db';
import { resolveActiveModel, resolveActiveSelection, type ActiveSelection } from '../models/activeModel';
import { prepareChatModel, type PrepareChatModelResult } from '../models/prepareChatModel';
import {
  TEXT_ONLY_MODALITIES,
  toUserMessage,
  type BackendTier,
  type EngineError,
  type EngineErrorType,
  type InstalledModel,
  type ModelModalities,
} from '../types';

const KNOWN_ENGINE_ERROR_TYPES: readonly EngineErrorType[] = ['unsupported', 'download', 'load', 'oom', 'inference', 'aborted'];

// Anything below engine.loadModel() (IndexedDB reads, capability probes)
// can throw a raw DOMException or browser-specific error rather than a
// typed EngineError - confirmed by a Samsung Internet report where a
// stored FileSystemFileHandle failed to deserialize and left the screen
// stuck with no feedback at all. Never let a shape we don't recognize
// reach toUserMessage(), which assumes a known `type` (P4-T rule: user-safe
// error messages, never raw internals).
function safeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'type' in error && KNOWN_ENGINE_ERROR_TYPES.includes((error as EngineError).type)) {
    const engineError = error as EngineError;
    return engineError.message || toUserMessage(engineError);
  }
  return 'The model could not be loaded.';
}

export type ChatEngineStatus =
  | 'checking'
  | 'no-model'
  | 'needs-permission'
  | 'missing'
  | 'crash-risk'
  | 'loading-model'
  | 'ready'
  | 'error';

interface ChatEngineState {
  readonly status: ChatEngineStatus;
  // 'remote' means the online API answers instead of a resident model.
  // Chat reads this to say so in the header, because the difference is the
  // difference between a prompt that stays on the device and one that does
  // not.
  readonly backend: ActiveSelection['kind'];
  readonly tier: BackendTier | null;
  readonly model: InstalledModel | null;
  readonly modalities: ModelModalities;
  readonly errorMessage: string | null;
}

const INITIAL_STATE: ChatEngineState = {
  status: 'checking',
  backend: 'none',
  tier: null,
  model: null,
  modalities: TEXT_ONLY_MODALITIES,
  errorMessage: null,
};

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

      // Tracks the model to attribute a failure to, however early it
      // happens - the whole pipeline below can throw (see safeErrorMessage
      // above), not just the loadModel() call.
      let modelForError: InstalledModel | null = null;
      let flagWritten = false;

      try {
        // The crash check runs BEFORE prepareChatModel(), and the flag is
        // written before it too. Preparing a model opens its bytes (OPFS
        // handles, wllama's cache), which is itself heavy enough to get a
        // tab killed on iOS - an earlier version only wrapped loadModel(),
        // so a kill during preparation was never recorded and Safari
        // crash-looped until it gave up with "a problem repeatedly
        // occurred". Only settings and the installed-model list are read
        // first, both cheap IndexedDB reads that touch no weights.
        const settings = await loadSettings();
        if (cancelled) return;

        const selection = await resolveActiveSelection();
        if (cancelled) return;

        // The online path loads no weights, so it is reachable even while a
        // local model's crash flag is still set - that flag describes the
        // model, not the app, and blocking here would trap a user whose only
        // way out is the backend that cannot run out of memory.
        if (selection.kind === 'remote') {
          await engine.activateRemote(settings.remoteProviders);
          if (cancelled) return;
          setState({ status: 'ready', backend: 'remote', tier: null, model: null, modalities: TEXT_ONLY_MODALITIES, errorMessage: null });
          return;
        }

        engine.deactivateRemote();

        // reloadKey > 0 means the user already clicked an explicit retry
        // ("Try again" / "Load anyway"), which is the conscious
        // confirmation this guard exists to require.
        if (settings.pendingLoadModelId !== null && reloadKey === 0) {
          const lastAttempted = await resolveActiveModel();
          if (cancelled) return;
          setState({ status: 'crash-risk', backend: 'local', tier: null, model: lastAttempted, modalities: TEXT_ONLY_MODALITIES, errorMessage: null });
          return;
        }

        const active = await resolveActiveModel();
        if (cancelled) return;
        if (!active) {
          setState({ status: 'no-model', backend: 'none', tier: null, model: null, modalities: TEXT_ONLY_MODALITIES, errorMessage: null });
          return;
        }
        modelForError = active;

        await patchSettings({ pendingLoadModelId: active.modelId });
        flagWritten = true;

        const prepared = await prepareChatModel();
        if (cancelled) return;
        if ('model' in prepared) modelForError = prepared.model;

        if (prepared.status !== 'ready') {
          await patchSettings({ pendingLoadModelId: null });
          if (cancelled) return;
          setState({
            status: toStatus(prepared),
            backend: 'local',
            tier: null,
            model: 'model' in prepared ? prepared.model : null,
            modalities: TEXT_ONLY_MODALITIES,
            errorMessage: null,
          });
          return;
        }

        setState({ status: 'loading-model', backend: 'local', tier: null, model: prepared.model, modalities: TEXT_ONLY_MODALITIES, errorMessage: null });

        const caps = await probeCapabilities();
        if (cancelled) return;

        const tier = settings.backendOverride === 'auto' ? caps.tier : settings.backendOverride;
        const modalities = await engine.loadModel(prepared.blobs, { ...caps, tier }, {
          nCtx: settings.nCtx,
          temperature: settings.temperature,
          topK: settings.topK,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
          seed: null,
          systemPrompt: null,
        });
        await patchSettings({ pendingLoadModelId: null });
        if (cancelled) return;

        setState({ status: 'ready', backend: 'local', tier, model: prepared.model, modalities, errorMessage: null });
      } catch (error) {
        if (flagWritten) {
          await patchSettings({ pendingLoadModelId: null }).catch(() => undefined);
        }
        if (cancelled) return;
        setState({ status: 'error', backend: 'local', tier: null, model: modelForError, modalities: TEXT_ONLY_MODALITIES, errorMessage: safeErrorMessage(error) });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return state;
}
