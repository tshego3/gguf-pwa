import { describe, expect, it } from 'vitest';
import { toUserMessage, withOpfsHint } from './errors';

describe('toUserMessage', () => {
  it('maps each error type to exactly one fixed sentence', () => {
    expect(toUserMessage({ type: 'oom', message: 'anything' })).toContain('Not enough memory');
    expect(toUserMessage({ type: 'aborted', message: 'anything' })).toBe('');
  });
});

describe('withOpfsHint', () => {
  it('appends the Private Browsing hint when the raw cause matches WebKit\'s OPFS error text', () => {
    const cause = { name: 'UnknownError', message: 'The operation failed for an unknown transient reason (e.g. out of memory).' };
    const result = withOpfsHint('Model download failed.', cause);
    expect(result).toContain('Model download failed.');
    expect(result).toContain('Private Browsing');
  });

  it('matches on a plain string cause too', () => {
    const result = withOpfsHint('Could not copy the model.', 'unknown transient reason');
    expect(result).toContain('Private Browsing');
  });

  it('leaves the base message unchanged for any other cause', () => {
    expect(withOpfsHint('Model download failed.', new Error('network error'))).toBe('Model download failed.');
    expect(withOpfsHint('Model download failed.', undefined)).toBe('Model download failed.');
  });
});
