export type EngineError =
  | { readonly type: 'unsupported'; readonly message: string }
  | { readonly type: 'download'; readonly message: string; readonly status?: number }
  | { readonly type: 'load'; readonly message: string }
  | { readonly type: 'oom'; readonly message: string }
  | { readonly type: 'inference'; readonly message: string }
  | { readonly type: 'aborted'; readonly message: string };

export type EngineErrorType = EngineError['type'];

const USER_SAFE_MESSAGE: Record<EngineErrorType, string> = {
  unsupported: 'This browser cannot run local models.',
  download: 'Download failed. Check your connection and try again.',
  load: 'This model could not be loaded. It may be incomplete.',
  oom: 'Not enough memory on this device for this model. Try a smaller one.',
  inference: 'Something went wrong during generation. Please try again.',
  aborted: '',
};

// Maps an EngineError to exactly one user-safe sentence. `aborted` is not an
// error and has no message - callers must check `type === 'aborted'` first
// and skip rendering rather than displaying an empty string.
export function toUserMessage(error: EngineError): string {
  return USER_SAFE_MESSAGE[error.type];
}

// WebKit's exact wording for "OPFS is unreachable in this context" -
// confirmed against real Safari for both the local-file copy path and a
// catalog download, both routed through OPFS. Private Browsing is the most
// common real-world cause: the API stays present (so a typeof check alone
// misses it) but throws this the moment it is actually called.
const OPFS_UNKNOWN_TRANSIENT_PATTERN = /unknown transient reason/i;

// Appends an actionable hint to a user-safe message when the raw
// underlying cause (never shown directly - see toUserMessage) matches this
// known pattern. Returns the base message unchanged for any other cause.
export function withOpfsHint(baseMessage: string, rawCause: unknown): string {
  // DOMException (what Safari actually throws here) does not extend Error
  // in every implementation, so this reads .message structurally rather
  // than relying on `instanceof Error`.
  const hasMessage = typeof rawCause === 'object' && rawCause !== null && 'message' in rawCause;
  const causeText = hasMessage
    ? String((rawCause as { message: unknown }).message)
    : typeof rawCause === 'string'
      ? rawCause
      : '';
  if (!OPFS_UNKNOWN_TRANSIENT_PATTERN.test(causeText)) return baseMessage;
  return `${baseMessage} On Safari, Private Browsing is the most common cause - try a regular window.`;
}
