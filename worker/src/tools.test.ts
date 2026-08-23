import { describe, expect, it } from 'vitest';
import { buildToolRegistry, isBlockedHost, runToolCall, toolSpecs, toPlainText } from './tools';

describe('buildToolRegistry', () => {
  // fetch_url is an SSRF-shaped surface on a public proxy, so it is opt-in
  // and the default deployment does not carry it.
  it('offers only the time tool until web fetch is switched on', () => {
    expect([...buildToolRegistry({}).keys()]).toEqual(['get_current_time']);
    expect([...buildToolRegistry({ ENABLE_WEB_FETCH: 'true' }).keys()]).toContain('fetch_url');
  });

  it('describes each tool in the shape a chat-completions API expects', () => {
    for (const spec of toolSpecs(buildToolRegistry({ ENABLE_WEB_FETCH: 'true' }))) {
      expect(spec.type).toBe('function');
      expect(spec.function.name).toMatch(/^[a-z_]+$/);
      expect(spec.function.parameters).toHaveProperty('type', 'object');
    }
  });
});

describe('isBlockedHost', () => {
  it('refuses loopback, private ranges, and the cloud metadata address', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.1.1', '169.254.169.254', '::1', 'db.internal']) {
      expect(isBlockedHost(host)).toBe(true);
    }
  });

  it('allows an ordinary public host', () => {
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('en.wikipedia.org')).toBe(false);
  });
});

describe('toPlainText', () => {
  it('drops script and style bodies rather than reading them out', () => {
    const html = '<style>body{color:red}</style><p>Hello</p><script>alert(1)</script>';
    expect(toPlainText(html)).toBe('Hello');
  });

  it('collapses markup and whitespace into readable text', () => {
    expect(toPlainText('<h1>A</h1>\n\n<p>B &amp; C</p>')).toBe('A B & C');
  });
});

describe('runToolCall', () => {
  const registry = buildToolRegistry({});

  it('answers with the current time for a valid zone', async () => {
    const out = await runToolCall(registry, 'get_current_time', '{"timezone":"Africa/Johannesburg"}');
    expect(out).toContain('Africa/Johannesburg');
  });

  it('defaults to UTC when no zone is given', async () => {
    expect(await runToolCall(registry, 'get_current_time', '')).toContain('UTC');
  });

  // A model can recover from a message and cannot recover from a dropped
  // turn, so every one of these is tool output rather than an exception.
  it('reports an unknown tool instead of throwing', async () => {
    expect(await runToolCall(registry, 'delete_everything', '{}')).toContain('No tool named');
  });

  it('reports unparseable arguments instead of throwing', async () => {
    expect(await runToolCall(registry, 'get_current_time', '{oops')).toContain('valid JSON');
  });

  it('reports an unknown time zone instead of throwing', async () => {
    expect(await runToolCall(registry, 'get_current_time', '{"timezone":"Mars/Olympus"}')).toContain('Unknown time zone');
  });
});
