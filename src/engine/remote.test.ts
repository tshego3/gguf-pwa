import { describe, expect, it } from 'vitest';
import { estimateTokens, flattenMessages, isNonReply } from './remote';
import type { EngineChatMessage } from './protocol';

function user(content: string): EngineChatMessage {
  return { role: 'user', content };
}

describe('flattenMessages', () => {
  // These endpoints take one prompt string, so a first turn is sent bare -
  // wrapping a single question in transcript labels changes the reply for
  // no reason.
  it('sends a lone user turn as plain text', () => {
    expect(flattenMessages([user('Hello world')])).toBe('Hello world');
  });

  it('prefixes the system prompt to a lone turn', () => {
    const messages: EngineChatMessage[] = [{ role: 'system', content: 'Be brief.' }, user('Hi')];
    expect(flattenMessages(messages)).toBe('Be brief.\n\nHi');
  });

  it('labels a multi-turn history and leaves the reply slot open', () => {
    const messages: EngineChatMessage[] = [
      user('First'),
      { role: 'assistant', content: 'Reply' },
      user('Second'),
    ];
    expect(flattenMessages(messages)).toBe('User: First\n\nAssistant: Reply\n\nUser: Second\n\nAssistant:');
  });

  it('keeps the system prompt ahead of a labelled transcript', () => {
    const messages: EngineChatMessage[] = [
      { role: 'system', content: 'Be brief.' },
      user('First'),
      { role: 'assistant', content: 'Reply' },
      user('Second'),
    ];
    expect(flattenMessages(messages).startsWith('Be brief.\n\nUser: First')).toBe(true);
  });

  it('returns an empty string for no messages', () => {
    expect(flattenMessages([])).toBe('');
  });
});

describe('estimateTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('isNonReply', () => {
  // The prexzyapis ai4chat endpoint answers HTTP 200 with a success-shaped
  // body whose reply slot reads "Invalid Request" whenever its upstream
  // fails. That must count as a failure, not as the assistant's answer.
  it('treats a provider failure sentinel as not a reply', () => {
    expect(isNonReply('Invalid Request')).toBe(true);
    expect(isNonReply('  invalid request  ')).toBe(true);
    expect(isNonReply('Error')).toBe(true);
  });

  it('leaves a real reply alone, including one that mentions an error', () => {
    expect(isNonReply('That request is invalid because the syntax is wrong.')).toBe(false);
    expect(isNonReply('Hello world')).toBe(false);
    expect(isNonReply('')).toBe(false);
  });
});
