// The online API path. This is the one part of the app that sends a
// prompt off the device, so it is opt-in, named plainly in the UI, and
// never the default.
//
// Providers are ordered: index 0 is the primary, every later entry is a
// fallback tried only when the one before it fails before producing any
// output. Index 0 is the project's own Cloudflare Worker, which holds the
// keys for Ollama, Hugging Face and NVIDIA NIM and walks that chain
// server-side (see worker/README.md). No key appears in this file or
// anywhere else in the bundle, because a public static site cannot hold
// one. The two keyless endpoints stay on as the last resort for when every
// keyed provider is out of quota, or when nobody has deployed the Worker.

// GET puts the prompt in the URL, which is all a keyless {prompt} endpoint
// accepts. POST sends the real role array in a JSON body, which the Worker
// forwards to a chat-completions upstream: better replies than a flattened
// transcript, and no URL-length ceiling on a conversation carrying
// attachment text.
export type RemoteMethod = 'GET' | 'POST';

export interface RemoteProvider {
  readonly id: string;
  readonly name: string;
  // For GET, an https URL containing the literal token {prompt}, replaced
  // with the URI-encoded prompt at request time. For POST, a plain https
  // URL - the messages go in the body.
  readonly urlTemplate: string;
  readonly method: RemoteMethod;
  readonly enabled: boolean;
}

// The id the active-model setting carries when the online API is selected.
// It shares the id space with installed models so one switcher can offer
// both, and the `remote:` prefix cannot collide with a catalog id or a
// local-file id (both are plain slugs).
export const REMOTE_MODEL_ID = 'remote:online';

export const REMOTE_MODEL_LABEL = 'Online API (no download)';

// The hostname `wrangler deploy` printed for worker/. Changing it means
// changing the matching entry in scripts/check-no-telemetry.sh too, or the
// build fails on purpose. Setting it back to a `.invalid` host - the RFC
// 2606 TLD that can never resolve - is how the proxy is switched off: the
// provider below then ships disabled and no request is ever aimed at it.
export const REMOTE_WORKER_HOST = 'gguf-proxy.feeds-pwa.workers.dev';

export const REMOTE_WORKER_CONFIGURED = !REMOTE_WORKER_HOST.endsWith('.invalid');

// The only hosts the online path may reach. This list is the single source
// for three places that must agree: the connect-src in index.html
// (injected by vite.config.ts), the CORP re-serve in src/sw.ts, and the
// endpoint validation in Settings. A meta-tag CSP cannot be changed at
// runtime, so a host that is not here is unreachable no matter what the
// user types - Settings says so rather than failing silently.
export const REMOTE_API_HOSTS: readonly string[] = [
  REMOTE_WORKER_HOST,
  'text.pollinations.ai',
  'prexzyapis.com',
];

export const DEFAULT_REMOTE_PROVIDERS: readonly RemoteProvider[] = [
  {
    id: 'worker',
    name: 'Keyed proxy (Ollama, Hugging Face, NVIDIA)',
    urlTemplate: `https://${REMOTE_WORKER_HOST}/`,
    method: 'POST',
    enabled: REMOTE_WORKER_CONFIGURED,
  },
  {
    id: 'pollinations',
    name: 'Pollinations',
    urlTemplate: 'https://text.pollinations.ai/{prompt}',
    method: 'GET',
    enabled: true,
  },
  {
    id: 'prexzy',
    name: 'Prexzy ai4chat',
    urlTemplate: 'https://prexzyapis.com/ai/ai4chat?prompt={prompt}',
    method: 'GET',
    enabled: true,
  },
];

export type RemoteEndpointCheck =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

// Validates a user-edited endpoint against what the CSP will actually
// permit. Runs before the value is stored, so a rejected endpoint never
// becomes a request that dies in the console.
export function checkRemoteEndpoint(urlTemplate: string, method: RemoteMethod = 'GET'): RemoteEndpointCheck {
  const hasToken = urlTemplate.includes('{prompt}');
  if (method === 'GET' && !hasToken) {
    return { valid: false, reason: 'The address must contain {prompt} where the message goes.' };
  }
  if (method === 'POST' && hasToken) {
    return { valid: false, reason: 'This endpoint takes the message in the request body, so the address must not contain {prompt}.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlTemplate.replace('{prompt}', 'test'));
  } catch {
    return { valid: false, reason: 'This is not a valid web address.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'The address must start with https://.' };
  }
  if (!REMOTE_API_HOSTS.includes(parsed.hostname)) {
    return {
      valid: false,
      reason: `Only ${REMOTE_API_HOSTS.join(', ')} are allowed. Other hosts are blocked by this app's content security policy, which is fixed at build time.`,
    };
  }
  return { valid: true };
}

export function buildRemoteUrl(urlTemplate: string, prompt: string): string {
  return urlTemplate.replace('{prompt}', encodeURIComponent(prompt));
}

// Settings are persisted as a whole object, so a stored provider list from
// an older build would pin the app to the providers that existed when it
// was written - a new primary would never reach an existing install. The
// shipped list is therefore the shape, and storage only supplies the two
// fields the user can change. Anything stored under an id this build no
// longer knows is dropped rather than trusted.
export function mergeRemoteProviders(stored: unknown): readonly RemoteProvider[] {
  if (!Array.isArray(stored)) return DEFAULT_REMOTE_PROVIDERS;

  return DEFAULT_REMOTE_PROVIDERS.map((preset) => {
    const saved = stored.find(
      (entry): entry is Record<string, unknown> =>
        entry !== null && typeof entry === 'object' && (entry as Record<string, unknown>).id === preset.id,
    );
    if (!saved) return preset;
    return {
      ...preset,
      urlTemplate: typeof saved.urlTemplate === 'string' ? saved.urlTemplate : preset.urlTemplate,
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : preset.enabled,
    };
  });
}
