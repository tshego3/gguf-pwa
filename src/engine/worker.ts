/// <reference lib="webworker" />

// The only file, together with modelManager.ts and wasmAssets.ts, that
// imports @wllama/wllama - it owns the one Wllama instance and never lets
// it, or any raw error it throws, cross the postMessage boundary unmapped.
import { Wllama, type ChatCompletionChunk } from '@wllama/wllama/esm/index.js';
import { mapEngineError } from './mapError';
import { WASM_PATH_CONFIG } from './wasmAssets';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let wllama: Wllama | null = null;
let currentAbortController: AbortController | null = null;

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

async function handleLoad(request: Extract<WorkerRequest, { kind: 'load' }>): Promise<void> {
  try {
    if (wllama) {
      // Single-residency rule: loading a second model unloads the first
      // explicitly, never leaving two resident at once (P3-T9).
      await wllama.exit().catch(() => undefined);
      wllama = null;
    }

    const instance = new Wllama(WASM_PATH_CONFIG, { allowOffline: true });
    await instance.loadModel(request.blobs, {
      n_ctx: request.params.nCtx,
      n_gpu_layers: request.params.nGpuLayers,
      n_threads: request.params.nThreads,
      // Reasoning models (Qwen3, DeepSeek-R1 distills, QwQ) only emit a
      // <think> trace when the chat template is actually applied (jinja)
      // and reasoning is turned on. 'deepseek-legacy' keeps the trace
      // inlined in delta.content as <think>...</think> rather than a
      // separate reasoning_content field, which ChatCompletionChunkDelta
      // in this wllama build doesn't have and our plain-text
      // AsyncIterable<string> pipeline has no way to carry anyway -
      // src/components/thinking.ts parses it back out client-side.
      // Models without a reasoning-aware template just ignore these.
      jinja: true,
      reasoning: true,
      reasoning_format: 'deepseek-legacy',
      default_template_kwargs: { enable_thinking: true },
    });
    wllama = instance;
    // Read straight from the loaded GGUF rather than guessing from the
    // model's name: a text-only build of a vision-capable architecture
    // reports false here, which is exactly what gates the image tool.
    post({
      id: request.id,
      kind: 'loaded',
      modalities: {
        supportsImage: instance.supportInputModality('image'),
        supportsAudio: instance.supportInputModality('audio'),
      },
    });
  } catch (error) {
    post({ id: request.id, kind: 'error', error: mapEngineError(error) });
  }
}

async function handleUnload(request: Extract<WorkerRequest, { kind: 'unload' }>): Promise<void> {
  try {
    if (wllama) {
      await wllama.exit();
      wllama = null;
    }
    post({ id: request.id, kind: 'ok' });
  } catch (error) {
    post({ id: request.id, kind: 'error', error: mapEngineError(error) });
  }
}

async function handleChat(request: Extract<WorkerRequest, { kind: 'chat' }>): Promise<void> {
  if (!wllama) {
    post({ id: request.id, kind: 'error', error: { type: 'load', message: 'No model is loaded.' } });
    return;
  }

  const controller = new AbortController();
  currentAbortController = controller;

  try {
    await wllama.createChatCompletion({
      // A message carrying images becomes an OpenAI-style content array;
      // plain turns stay simple strings, which is what every text-only
      // chat template expects.
      messages: request.messages.map((message) =>
        message.images && message.images.length > 0 && message.role === 'user'
          ? {
              role: 'user' as const,
              content: [
                ...message.images.map((data) => ({ type: 'image' as const, data })),
                { type: 'text' as const, text: message.content },
              ],
            }
          : { role: message.role, content: message.content },
      ),
      stream: true,
      temperature: request.params.temperature,
      top_k: request.params.topK,
      top_p: request.params.topP,
      max_tokens: request.params.maxTokens,
      seed: request.params.seed ?? undefined,
      abortSignal: controller.signal,
      onData: (chunk: ChatCompletionChunk) => {
        const token = chunk.choices[0]?.delta.content;
        if (token) post({ id: request.id, kind: 'chatToken', token });
      },
    });
    post({ id: request.id, kind: 'chatDone' });
  } catch (error) {
    post({ id: request.id, kind: 'error', error: mapEngineError(error) });
  } finally {
    if (currentAbortController === controller) currentAbortController = null;
  }
}

function handleAbort(): void {
  currentAbortController?.abort();
}

async function handleCountTokens(request: Extract<WorkerRequest, { kind: 'countTokens' }>): Promise<void> {
  if (!wllama) {
    post({ id: request.id, kind: 'countTokensResult', count: 0 });
    return;
  }

  try {
    // wllama has no standalone tokenize() in this build's public API - a
    // 1-token completion is the cheapest way to read back
    // usage.prompt_tokens, at the cost of generating one throwaway token.
    const response = await wllama.createChatCompletion({
      messages: [{ role: 'user', content: request.text }],
      stream: false,
      max_tokens: 1,
    });
    post({ id: request.id, kind: 'countTokensResult', count: response.usage.prompt_tokens });
  } catch (error) {
    post({ id: request.id, kind: 'error', error: mapEngineError(error) });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  switch (request.kind) {
    case 'load':
      void handleLoad(request);
      return;
    case 'unload':
      void handleUnload(request);
      return;
    case 'chat':
      void handleChat(request);
      return;
    case 'abort':
      handleAbort();
      return;
    case 'countTokens':
      void handleCountTokens(request);
      return;
  }
};
