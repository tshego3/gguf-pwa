// Server-Sent Events line framing. All three upstreams stream OpenAI-shaped
// SSE, so this is the one place that knows about `data:` lines and the
// `[DONE]` sentinel.
//
// The input is a third-party byte stream, which makes it untrusted: the
// buffer is capped so a stream that never emits a newline cannot grow
// without bound inside the Worker's memory limit.
const MAX_BUFFERED_BYTES = 512 * 1024;

export const SSE_DONE = '[DONE]';

export interface SseParser {
  // Returns the payload of every complete `data:` line in this chunk.
  push(chunk: string): readonly string[];
}

export function createSseParser(): SseParser {
  let buffer = '';

  return {
    push(chunk: string): readonly string[] {
      buffer += chunk;
      if (buffer.length > MAX_BUFFERED_BYTES) {
        throw new Error('Upstream sent an oversized event with no line break.');
      }

      const payloads: string[] = [];
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) return payloads;
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) payloads.push(line.slice(5).trim());
      }
    },
  };
}
