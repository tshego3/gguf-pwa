import { withOpfsHint, type EngineError } from '../types';

interface WllamaLikeError {
  readonly name?: string;
  readonly type?: string;
  readonly message?: string;
}

// Every failure becomes exactly one EngineError and, via toUserMessage(),
// one user-safe sentence. Raw wllama output (stack traces, WASM aborts,
// native error strings) never crosses this boundary (P3-T10).
export function mapEngineError(error: unknown): EngineError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { type: 'aborted', message: '' };
  }

  const err = error as WllamaLikeError;

  if (err?.name === 'WllamaAbortError') {
    return { type: 'aborted', message: '' };
  }

  if (err?.name === 'WllamaError') {
    switch (err.type) {
      case 'download_error':
        return { type: 'download', message: 'Model download failed.' };
      case 'load_error':
      case 'model_not_loaded':
        return { type: 'load', message: withOpfsHint('This model could not be loaded. It may be incomplete.', err.message) };
      case 'kv_cache_full':
        return { type: 'oom', message: 'Not enough memory on this device for this model. Try a smaller one.' };
      case 'inference_error':
        return { type: 'inference', message: 'Something went wrong during generation. Please try again.' };
      default:
        return { type: 'inference', message: 'Something went wrong during generation. Please try again.' };
    }
  }

  if (err?.name === 'WllamaRuntimeError') {
    return { type: 'oom', message: 'Not enough memory on this device for this model. Try a smaller one.' };
  }

  // Anything unrecognised is treated as a load failure rather than leaking
  // the raw message - typed EngineError callers never see native output.
  // The raw cause is logged (worker console, visible in dev tools on real
  // devices too) since this project has no remote console access of its
  // own to a device that reports a bug.
  console.error('Unmapped engine error:', error);
  return { type: 'load', message: withOpfsHint('This model could not be loaded. It may be incomplete.', error) };
}
