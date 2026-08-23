import { describe, expect, it } from 'vitest';
import { estimateTokens, failureRank, flattenMessages, isNonReply, mostActionable, remoteStatusMessage } from './remote';
import type { EngineError } from '../types';
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

describe('remoteStatusMessage', () => {
  // The point of this function: a user meets words, not a number. Every
  // message must name the provider and say what happened.
  it('names the provider in every message', () => {
    for (const status of [400, 401, 402, 403, 408, 413, 429, 500, 503, 504]) {
      expect(remoteStatusMessage('Keyed proxy', status)).toContain('Keyed proxy');
    }
  });

  it('calls an expired key what it is', () => {
    expect(remoteStatusMessage('Keyed proxy', 401)).toMatch(/expired|revoked/i);
    expect(remoteStatusMessage('Keyed proxy', 403)).toMatch(/expired|revoked/i);
  });

  it('explains a spent allowance rather than blaming the request', () => {
    expect(remoteStatusMessage('Keyed proxy', 402)).toMatch(/credit/i);
  });

  it('tells a rate-limited user to wait', () => {
    expect(remoteStatusMessage('Keyed proxy', 429)).toMatch(/wait a minute/i);
  });

  // A timeout is the one failure where the app has a genuinely better
  // answer to offer, so it points at the offline path.
  it('offers the offline path when the service is too slow', () => {
    for (const status of [408, 504, 524]) {
      expect(remoteStatusMessage('Keyed proxy', status)).toMatch(/downloaded model/i);
    }
  });

  it('tells an over-long conversation how to get shorter', () => {
    expect(remoteStatusMessage('Keyed proxy', 413)).toMatch(/new conversation|attachment/i);
  });

  // Retrying a spent credit or a dead key wastes the user's time, so those
  // two must not suggest it. Everything transient should.
  it('offers a retry only where a retry can help', () => {
    expect(remoteStatusMessage('X', 401)).not.toMatch(/try again/i);
    expect(remoteStatusMessage('X', 402)).not.toMatch(/try again/i);
    for (const status of [429, 500, 503, 504]) {
      expect(remoteStatusMessage('X', status)).toMatch(/try again/i);
    }
  });

  it('never leaks a bare status code as the whole message', () => {
    for (const status of [401, 402, 429, 500, 504]) {
      expect(remoteStatusMessage('X', status)).not.toMatch(/^X refused/);
    }
  });
});

function failed(message: string, status?: number): EngineError {
  return { type: 'inference', message, status };
}

describe('mostActionable', () => {
  // The case that made this necessary: the primary dies of an expired key,
  // the two keyless fallbacks then fail generically, and reporting the last
  // failure buries the only sentence anyone can act on.
  it('prefers an expired key over a later generic failure', () => {
    const best = mostActionable([failed('key expired', 401), failed('unavailable', 503), failed('unavailable', 503)]);
    expect(best?.message).toBe('key expired');
  });

  it('prefers a spent allowance over everything else', () => {
    const best = mostActionable([failed('rate limited', 429), failed('no credit', 402)]);
    expect(best?.message).toBe('no credit');
  });

  // A tie keeps the earlier provider, which is the higher-priority endpoint
  // the user configured.
  it('keeps the earlier provider when two failures rank the same', () => {
    const best = mostActionable([failed('primary down', 503), failed('fallback down', 503)]);
    expect(best?.message).toBe('primary down');
  });

  it('returns null for no failures at all', () => {
    expect(mostActionable([])).toBeNull();
  });

  it('handles a failure that carries no status', () => {
    expect(mostActionable([failed('no response')])?.message).toBe('no response');
  });
});

describe('failureRank', () => {
  it('ranks an actionable status ahead of an opaque one', () => {
    expect(failureRank(402)).toBeLessThan(failureRank(401));
    expect(failureRank(401)).toBeLessThan(failureRank(500));
    expect(failureRank(undefined)).toBe(failureRank(500));
  });
});
