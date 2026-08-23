import { describe, expect, it } from 'vitest';
import { parseChatInput } from './index';

const MAX = 100;

describe('parseChatInput', () => {
  // The keyless providers take one flattened string, so the Worker accepts
  // that shape too - it keeps GET /?prompt= working for a manual curl.
  it('accepts a single prompt string as one user turn', () => {
    expect(parseChatInput({ prompt: 'Hello' }, MAX)).toEqual({
      ok: true,
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  // The real reason the PWA posts to this Worker rather than using a
  // {prompt} URL: a chat-completions upstream answers better with real
  // roles than with a transcript flattened into one string.
  it('accepts a role array unchanged', () => {
    const messages = [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi' },
    ];
    expect(parseChatInput({ messages }, MAX)).toEqual({ ok: true, messages });
  });

  it('rejects an empty prompt and an empty array', () => {
    expect(parseChatInput({ prompt: '   ' }, MAX).ok).toBe(false);
    expect(parseChatInput({ messages: [] }, MAX).ok).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(parseChatInput('hello', MAX).ok).toBe(false);
    expect(parseChatInput(null, MAX).ok).toBe(false);
    expect(parseChatInput([{ role: 'user', content: 'hi' }], MAX).ok).toBe(false);
  });

  it('rejects a role the upstream must never be handed', () => {
    expect(parseChatInput({ messages: [{ role: 'tool', content: 'x' }] }, MAX).ok).toBe(false);
    expect(parseChatInput({ messages: [{ role: 'user' }] }, MAX).ok).toBe(false);
  });

  // This Worker costs money per token, so size is capped before a request
  // is made, not after the bill arrives.
  it('caps a single prompt and a whole conversation', () => {
    expect(parseChatInput({ prompt: 'x'.repeat(MAX + 1) }, MAX).ok).toBe(false);
    const messages = [
      { role: 'user', content: 'x'.repeat(60) },
      { role: 'assistant', content: 'y'.repeat(60) },
    ];
    expect(parseChatInput({ messages }, MAX).ok).toBe(false);
  });

  it('caps the number of turns', () => {
    const messages = Array.from({ length: 65 }, () => ({ role: 'user', content: 'x' }));
    expect(parseChatInput({ messages }, 10_000).ok).toBe(false);
  });
});
