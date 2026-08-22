// The online API path. This is the one part of the app that sends a
// prompt off the device, so it is opt-in, named plainly in the UI, and
// never the default.
//
// Providers are ordered: index 0 is the primary, every later entry is a
// fallback tried only when the one before it fails before producing any
// output. Both defaults are keyless public endpoints, which is why no
// secret appears anywhere in this file - see README for the planned
// Cloudflare Worker proxy that would hold a key for an authenticated API.

export interface RemoteProvider {
  readonly id: string;
  readonly name: string;
  // An https URL containing the literal token {prompt}, replaced with the
  // URI-encoded prompt at request time.
  readonly urlTemplate: string;
  readonly enabled: boolean;
}

// The id the active-model setting carries when the online API is selected.
// It shares the id space with installed models so one switcher can offer
// both, and the `remote:` prefix cannot collide with a catalog id or a
// local-file id (both are plain slugs).
export const REMOTE_MODEL_ID = 'remote:online';

export const REMOTE_MODEL_LABEL = 'Online API (no download)';

// The only hosts the online path may reach. This list is the single source
// for three places that must agree: the connect-src in index.html
// (injected by vite.config.ts), the CORP re-serve in src/sw.ts, and the
// endpoint validation in Settings. A meta-tag CSP cannot be changed at
// runtime, so a host that is not here is unreachable no matter what the
// user types - Settings says so rather than failing silently.
export const REMOTE_API_HOSTS: readonly string[] = ['text.pollinations.ai', 'prexzyapis.com'];

export const DEFAULT_REMOTE_PROVIDERS: readonly RemoteProvider[] = [
  {
    id: 'pollinations',
    name: 'Pollinations',
    urlTemplate: 'https://text.pollinations.ai/{prompt}',
    enabled: true,
  },
  {
    id: 'prexzy',
    name: 'Prexzy ai4chat',
    urlTemplate: 'https://prexzyapis.com/ai/ai4chat?prompt={prompt}',
    enabled: true,
  },
];

export type RemoteEndpointCheck =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

// Validates a user-edited endpoint against what the CSP will actually
// permit. Runs before the value is stored, so a rejected endpoint never
// becomes a request that dies in the console.
export function checkRemoteEndpoint(urlTemplate: string): RemoteEndpointCheck {
  if (!urlTemplate.includes('{prompt}')) {
    return { valid: false, reason: 'The address must contain {prompt} where the message goes.' };
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
      reason: `Only ${REMOTE_API_HOSTS.join(' and ')} are allowed. Other hosts are blocked by this app's content security policy, which is fixed at build time.`,
    };
  }
  return { valid: true };
}

export function buildRemoteUrl(urlTemplate: string, prompt: string): string {
  return urlTemplate.replace('{prompt}', encodeURIComponent(prompt));
}
