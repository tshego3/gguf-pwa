import { describe, expect, it } from 'vitest';
import { parseThinking } from './thinking';

describe('parseThinking', () => {
  it('returns the content unchanged when there is no think block', () => {
    expect(parseThinking('The capital of France is Paris.')).toEqual({
      thinking: null,
      answer: 'The capital of France is Paris.',
      isThinking: false,
    });
  });

  it('splits a completed think block from the answer that follows it', () => {
    const result = parseThinking('<think>The user wants the capital.</think>The capital is Paris.');
    expect(result).toEqual({
      thinking: 'The user wants the capital.',
      answer: 'The capital is Paris.',
      isThinking: false,
    });
  });

  it('reports isThinking while streaming inside an unclosed think block', () => {
    const result = parseThinking('<think>Let me work through this');
    expect(result.isThinking).toBe(true);
    expect(result.answer).toBe('');
    expect(result.thinking).toContain('Let me work through this');
  });

  it('transitions from isThinking to a real answer as more tokens arrive', () => {
    const midStream = parseThinking('<think>Reasoning so far');
    expect(midStream.isThinking).toBe(true);

    const complete = parseThinking('<think>Reasoning so far, done.</think>Here is the answer.');
    expect(complete.isThinking).toBe(false);
    expect(complete.answer).toBe('Here is the answer.');
  });

  it('trims whitespace around both the thinking text and the answer', () => {
    const result = parseThinking('<think>\n  reasoning  \n</think>\n\n  answer  \n');
    expect(result.thinking).toBe('reasoning');
    expect(result.answer).toBe('answer');
  });
});
