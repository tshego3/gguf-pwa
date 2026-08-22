import { describe, expect, it } from 'vitest';
import { buildRemoteUrl, checkRemoteEndpoint, DEFAULT_REMOTE_PROVIDERS, REMOTE_API_HOSTS } from './remote';

describe('checkRemoteEndpoint', () => {
  it('accepts both shipped defaults', () => {
    for (const provider of DEFAULT_REMOTE_PROVIDERS) {
      expect(checkRemoteEndpoint(provider.urlTemplate)).toEqual({ valid: true });
    }
  });

  it('rejects an address with no {prompt} token', () => {
    const result = checkRemoteEndpoint('https://text.pollinations.ai/hello');
    expect(result.valid).toBe(false);
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
});
