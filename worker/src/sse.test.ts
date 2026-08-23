import { describe, expect, it } from 'vitest';
import { createSseParser, SSE_DONE } from './sse';

describe('createSseParser', () => {
  it('returns the payload of each data line', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":1}\ndata: {"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  // Upstream chunk boundaries land anywhere, including mid-token. A parser
  // that assumes one chunk is one event drops tokens at random.
  it('joins an event split across chunks', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":')).toEqual([]);
    expect(parser.push('1}\n')).toEqual(['{"a":1}']);
  });

  it('handles CRLF line endings and blank separator lines', () => {
    const parser = createSseParser();
    expect(parser.push('data: one\r\n\r\ndata: two\r\n')).toEqual(['one', 'two']);
  });

  it('ignores comment and event lines', () => {
    const parser = createSseParser();
    expect(parser.push(': keepalive\nevent: message\ndata: hi\n')).toEqual(['hi']);
  });

  it('passes the done sentinel through for the caller to recognise', () => {
    expect(createSseParser().push(`data: ${SSE_DONE}\n`)).toEqual([SSE_DONE]);
  });

  // The body is a third party's, so a stream that never emits a newline is
  // a memory-exhaustion vector, not a curiosity.
  it('refuses an unbounded line', () => {
    const parser = createSseParser();
    expect(() => parser.push('x'.repeat(600 * 1024))).toThrow(/oversized/);
  });
});
