import { describe, expect, it } from 'vitest';
import { applyChunk, closeReasoning, collectToolCalls, createStreamState } from './deltas';

function chunk(delta: Record<string, unknown>, finish: string | null = null): string {
  return JSON.stringify({ choices: [{ delta, finish_reason: finish }] });
}

describe('applyChunk', () => {
  it('emits content deltas as plain text', () => {
    const state = createStreamState();
    expect(applyChunk(state, chunk({ content: 'Hello' }))).toBe('Hello');
    expect(applyChunk(state, chunk({ content: ' world' }))).toBe(' world');
    expect(state.emittedText).toBe(true);
  });

  it('emits nothing for a role-only opening chunk', () => {
    expect(applyChunk(createStreamState(), chunk({ role: 'assistant' }))).toBe('');
  });

  // src/components/thinking.ts already parses <think></think> for local
  // reasoning models. Wrapping the separate reasoning_content field in the
  // same markers gets the online path a collapsible trace for free.
  it('wraps reasoning_content in think markers and closes it when the answer starts', () => {
    const state = createStreamState();
    expect(applyChunk(state, chunk({ reasoning_content: 'weighing' }))).toBe('<think>weighing');
    expect(applyChunk(state, chunk({ reasoning_content: ' it up' }))).toBe(' it up');
    expect(applyChunk(state, chunk({ content: 'Answer' }))).toBe('</think>Answer');
    expect(state.reasoningOpen).toBe(false);
  });

  it('closes a reasoning block the upstream never terminated', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ reasoning_content: 'thinking' }));
    expect(closeReasoning(state)).toBe('</think>');
    expect(closeReasoning(state)).toBe('');
  });

  it('survives a malformed payload without throwing', () => {
    const state = createStreamState();
    expect(applyChunk(state, 'not json')).toBe('');
    expect(applyChunk(state, '{"choices":"wrong"}')).toBe('');
    expect(applyChunk(state, '{}')).toBe('');
  });

  it('records the finish reason', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ content: 'x' }, 'stop'));
    expect(state.finishReason).toBe('stop');
  });
});

describe('collectToolCalls', () => {
  // Arguments arrive a few characters at a time across many chunks, keyed by
  // index. Reassembling them wrong means calling the tool with broken JSON.
  it('reassembles a call whose name and arguments span chunks', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'get_current_time' } }] }));
    applyChunk(state, chunk({ tool_calls: [{ index: 0, function: { arguments: '{"timez' } }] }));
    applyChunk(state, chunk({ tool_calls: [{ index: 0, function: { arguments: 'one":"UTC"}' } }] }, 'tool_calls'));

    expect(collectToolCalls(state)).toEqual([
      { id: 'call_a', name: 'get_current_time', args: '{"timezone":"UTC"}' },
    ]);
    expect(state.finishReason).toBe('tool_calls');
  });

  it('keeps two parallel calls apart and in index order', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ tool_calls: [{ index: 1, id: 'b', function: { name: 'second', arguments: '{}' } }] }));
    applyChunk(state, chunk({ tool_calls: [{ index: 0, id: 'a', function: { name: 'first', arguments: '{}' } }] }));
    expect(collectToolCalls(state).map((call) => call.name)).toEqual(['first', 'second']);
  });

  // Some upstreams omit the index field entirely.
  it('falls back to array position when index is missing', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ tool_calls: [{ id: 'a', function: { name: 'first', arguments: '{}' } }] }));
    expect(collectToolCalls(state)).toHaveLength(1);
  });

  it('discards a fragment that never received a name', () => {
    const state = createStreamState();
    applyChunk(state, chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }));
    expect(collectToolCalls(state)).toEqual([]);
  });
});
