---
name: gguf-pwa-state-testing
description: Gold Standard 4-branch state management pattern, streaming state, and Vitest + Playwright testing rules for gguf-pwa. Use when building or editing any screen/hook that fetches or displays async data (loading/error/empty states), handles token streaming or abort, maps engine errors, or when writing/updating unit or end-to-end tests.
---

# Gold Standard State Management and Testing

**Mandatory pattern** for all screens/components that fetch and display async data.

## State Structure (Required Elements)

Every async data-loading screen must manage:

1. **Data state** - `items: T[]` (raw data from service, always initialized to `[]`)
2. **Loading state** - `isLoading: boolean` (true during fetch)
3. **Error state** - `errorMessage: string | null` (user-safe error, null on success)
4. **Filter inputs** - stored in state
5. **Derived/computed** - `filteredItems`, `hasItems`, `resultCount` (never stored, always computed fresh)

## 4-Branch Rendering Pattern (Exact Order)

```typescript
if (isLoading) {
  // BRANCH 1: Loading - skeleton/spinner
} else if (errorMessage) {
  // BRANCH 2: Error - message + "Try Again" action (always provided)
} else if (items.length > 0) {
  // BRANCH 3: Data - content + filters (render filteredItems, never raw items)
} else {
  // BRANCH 4: Empty - guidance message
}
```

## Streaming Is a Fifth Condition, Not a Fifth Branch

Token streaming lives **inside Branch 3**. It does not replace the pattern and it does not add a branch.

1. `isStreaming: boolean` is separate from `isLoading`. `isLoading` covers fetching the conversation; `isStreaming` covers token generation. Conflating them makes the transcript disappear mid-reply.
2. The transcript stays rendered while streaming. Never fall back to Branch 1 once messages exist.
3. **Abort is not an error.** `{ type: 'aborted' }` sets no `errorMessage`. It ends the stream, persists the partial reply with `partial: true`, and returns to the idle data branch.
4. Batch token appends to animation frames. Never set state per token.
5. On abort or failure mid-stream, the partial assistant message persists. Losing the user's output is worse than showing an incomplete reply.

## Long Operations Need Determinate Progress

Model download and model load are not "loading" - they are operations with a known total.

1. Report `bytesLoaded` and `bytesTotal`, not a boolean.
2. Cancel is always available and always wired to a real `AbortController`.
3. A cancelled download is `{ type: 'aborted' }`, which is not an error and shows no error message.

## Error Handling

Map every `EngineError` to exactly one user-safe sentence. Raw wllama output never reaches the UI.

| Type | User-facing message |
|------|---------------------|
| `unsupported` | "This browser cannot run local models." |
| `download` | "Download failed. Check your connection and try again." |
| `load` | "This model could not be loaded. It may be incomplete." |
| `oom` | "Not enough memory on this device for this model. Try a smaller one." |
| `inference` | "Something went wrong during generation. Please try again." |
| `aborted` | *(no message - not an error)* |

1. `oom` always offers a concrete next action: open Models filtered to what this device can run.
2. A tab kill produces no catchable error. Recover on next launch instead of trying to handle it.

## Non-Negotiable Rules

1. Set `isLoading = true` at start and `false` in exactly one place: the `finally` block. Same for `isStreaming`.
2. Always initialize collections to `[]` - never `undefined`.
3. Keep filter/search logic in the service/hook layer as pure computed derivations - never in components.
4. Never skip a branch - always render all 4, in order.
5. Never show raw error strings to users.
6. Never treat `aborted` as an error.

## Anti-Patterns

- DO NOT display `items` directly - use computed `filteredItems`
- DO NOT set `isLoading = false` in multiple places - use `finally`
- DO NOT catch errors silently - always set `errorMessage` or log
- DO NOT store computed results in state - derive fresh each render
- DO NOT use non-null assertions (`!`) on state values - use optional chaining or guards
- DO NOT use `isLoading` for streaming - the transcript must stay on screen
- DO NOT show a spinner for a download - show bytes against a total

## Unit Testing (Vitest)

1. Vitest for unit tests, co-located with source (`engine/prompt.ts` -> `engine/prompt.test.ts`).
2. Test the pure layer, which is where the logic actually lives: prompt assembly, generation-parameter validation, `EngineError` to message mapping, backend tier selection, GGUF header validation, catalog parsing, KV cache size calculation, and state flows (`isLoading` false after completion, `errorMessage` set on failure and null on success, `aborted` sets no message).
3. **Do not unit-test wllama.** Mock the engine interface. The engine's real behavior is verified end to end.
4. Name tests descriptively: `describe('selectBackendTier')` -> `it('prefers WebGPU over multi-thread WASM when both are available')`.
5. Run `npm run build` to verify zero TypeScript errors before completion.

## End-to-End Testing (Playwright)

Run `@playwright/test` across Chromium, Firefox, and WebKit projects.

1. **Never download a real model in CI.** Use the sub-1MB `stories260K.gguf` fixture committed at `e2e/fixtures/`. Use `page.route()` to point the catalog at it so the download-manager path is still exercised end to end.
2. Cover: full chat flow; **local file load via `setInputFiles()`** (the highest-value test in the suite, because it is the primary acquisition path and needs no network); offline via `context.setOffline(true)`; service worker registration and the update prompt; `crossOriginIsolated` asserted with `page.evaluate()` after the SW takes control; OPFS and IndexedDB persistence across reloads; incremental streaming; abort leaving the engine usable; sanitization (ask the model to emit a script tag, assert it renders as text).
3. Accessibility with `@axe-core/playwright` on Chat, Models, and Settings.
4. Layout screenshots at 360, 768, and 1280 px.

## What Playwright Cannot Cover

State this plainly in the repo so nobody mistakes a green CI run for device confidence.

1. **Playwright's WebKit is not iOS Safari.** It is a desktop WebKit build with no jetsam memory ceiling, different OPFS quotas, and different WebGPU support. It cannot tell you whether a 1 GB model survives on an iPhone - the most important open question in this project.
2. **Memory ceilings and thermal throttling** do not reproduce on a CI runner.
3. **WebGPU is unreliable headless.** It needs a headed run on real hardware, or `--enable-unsafe-swiftshader`, which is CPU emulation and proves correctness only, never performance.

## The Three Gates

| Gate | Tool | Runs |
|------|------|------|
| Units - prompt assembly, param validation, error mapping, tier selection | Vitest | Every commit |
| Correctness E2E - flows, offline, persistence, a11y | Playwright, tiny fixture | Every commit |
| Performance and memory - tokens/sec, peak memory, survival | Manual, real devices | Every phase gate |

The manual device matrix is not optional and does not shrink. iOS, Windows, and Android all appear at every gate. A phase is not done when CI is green; it is done when the device matrix is recorded.
