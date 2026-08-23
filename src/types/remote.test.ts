import { describe, expect, it } from 'vitest';
import {
  buildRemoteUrl,
  checkRemoteEndpoint,
  DEFAULT_REMOTE_PROVIDERS,
  mergeRemoteProviders,
  REMOTE_API_HOSTS,
  REMOTE_WORKER_CONFIGURED,
  REMOTE_WORKER_HOST,
} from './remote';

describe('checkRemoteEndpoint', () => {
  it('accepts every shipped default under its own method', () => {
    for (const provider of DEFAULT_REMOTE_PROVIDERS) {
      expect(checkRemoteEndpoint(provider.urlTemplate, provider.method)).toEqual({ valid: true });
    }
  });

  it('rejects a GET address with no {prompt} token', () => {
    const result = checkRemoteEndpoint('https://text.pollinations.ai/hello');
    expect(result.valid).toBe(false);
  });

  // The keyed proxy takes the conversation in the body, so a {prompt} token
  // in its URL would be sent twice and encoded into a URL for no reason.
  it('rejects a POST address that carries a {prompt} token', () => {
    const result = checkRemoteEndpoint(`https://${REMOTE_WORKER_HOST}/{prompt}`, 'POST');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('request body');
  });

  it('rejects plain http', () => {
    const result = checkRemoteEndpoint('http://text.pollinations.ai/{prompt}');
    expect(result.valid).toBe(false);
  });

  // The CSP is a build-time meta tag, so a host outside the list is
  // unreachable no matter what is stored. Settings must say so rather than
  // accepting a value that silently fails at request time.
  it('rejects a host outside the CSP allow-list', () => {
    const result = checkRemoteEndpoint('https://example.com/{prompt}');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain(REMOTE_API_HOSTS[0]);
  });

  it('rejects a value that is not a URL', () => {
    expect(checkRemoteEndpoint('{prompt}').valid).toBe(false);
  });
});

describe('DEFAULT_REMOTE_PROVIDERS', () => {
  // The user-visible order: the keyed proxy first, the keyless endpoints
  // behind it. Reordering this changes where prompts go, so it is asserted.
  it('puts the keyed proxy ahead of the keyless endpoints', () => {
    expect(DEFAULT_REMOTE_PROVIDERS.map((p) => p.id)).toEqual(['worker', 'pollinations', 'prexzy']);
  });

  // The proxy is enabled exactly when its hostname is real. Pointing
  // REMOTE_WORKER_HOST back at a `.invalid` host is how it is switched off,
  // and shipping it enabled with an unresolvable host would spend a DNS
  // failure on every message before reaching a working endpoint.
  it('is enabled exactly when a real hostname is configured', () => {
    expect(DEFAULT_REMOTE_PROVIDERS[0]?.enabled).toBe(REMOTE_WORKER_CONFIGURED);
    expect(REMOTE_WORKER_CONFIGURED).toBe(!REMOTE_WORKER_HOST.endsWith('.invalid'));
  });

  it('ships no key or key-shaped string', () => {
    expect(JSON.stringify(DEFAULT_REMOTE_PROVIDERS)).not.toMatch(/(api[-_]?key|bearer|sk-|hf_|nvapi-)/i);
  });
});

describe('buildRemoteUrl', () => {
  it('URI-encodes the prompt into the template', () => {
    expect(buildRemoteUrl('https://text.pollinations.ai/{prompt}', 'Hello world')).toBe(
      'https://text.pollinations.ai/Hello%20world',
    );
  });

  it('encodes characters that would otherwise change the URL structure', () => {
    const url = buildRemoteUrl('https://prexzyapis.com/ai/ai4chat?prompt={prompt}', 'a&b=c#d');
    expect(url).toBe('https://prexzyapis.com/ai/ai4chat?prompt=a%26b%3Dc%23d');
    expect(new URL(url).searchParams.get('prompt')).toBe('a&b=c#d');
  });

  it('leaves a POST endpoint untouched', () => {
    const template = `https://${REMOTE_WORKER_HOST}/`;
    expect(buildRemoteUrl(template, 'anything')).toBe(template);
  });
});

describe('mergeRemoteProviders', () => {
  it('returns the shipped list when nothing is stored', () => {
    expect(mergeRemoteProviders(undefined)).toEqual(DEFAULT_REMOTE_PROVIDERS);
    expect(mergeRemoteProviders('nonsense')).toEqual(DEFAULT_REMOTE_PROVIDERS);
  });

  // The reason this function exists: an install that saved settings before
  // the proxy shipped must still get the proxy, not the two-entry list it
  // wrote to IndexedDB months ago.
  it('adds a provider an older stored list never knew about', () => {
    const stored = [
      { id: 'pollinations', name: 'Pollinations', urlTemplate: 'https://text.pollinations.ai/{prompt}', enabled: true },
      { id: 'prexzy', name: 'Prexzy ai4chat', urlTemplate: 'https://prexzyapis.com/ai/ai4chat?prompt={prompt}', enabled: true },
    ];
    expect(mergeRemoteProviders(stored).map((p) => p.id)).toEqual(['worker', 'pollinations', 'prexzy']);
  });

  it('keeps an edited address and an explicit disable', () => {
    const stored = [{ id: 'pollinations', urlTemplate: 'https://text.pollinations.ai/x/{prompt}', enabled: false }];
    const merged = mergeRemoteProviders(stored);
    expect(merged[1]?.urlTemplate).toBe('https://text.pollinations.ai/x/{prompt}');
    expect(merged[1]?.enabled).toBe(false);
  });

  // Method is a property of the endpoint, not of the address the user
  // typed, so it always comes from this build rather than from storage.
  it('takes the method from the shipped list, not from storage', () => {
    const stored = [{ id: 'worker', urlTemplate: `https://${REMOTE_WORKER_HOST}/`, enabled: true, method: 'GET' }];
    expect(mergeRemoteProviders(stored)[0]?.method).toBe('POST');
  });

  it('drops a stored provider this build no longer ships', () => {
    const stored = [{ id: 'ancient', urlTemplate: 'https://example.com/{prompt}', enabled: true }];
    expect(mergeRemoteProviders(stored).map((p) => p.id)).toEqual(['worker', 'pollinations', 'prexzy']);
  });
});
