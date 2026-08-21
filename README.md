# gguf-pwa

A browser-local LLM client. Downloads or opens a quantized llama.cpp GGUF model and runs inference entirely on the user's device via WebAssembly and WebGPU.

**No inference server, no API key, no telemetry.** After the weights land, no request leaves the browser.

## Status

Core chat/model-management flow implemented and passing CI (build, lint, Vitest, Playwright across Chromium/Firefox/WebKit). No physical iPhone/Android/Windows hardware exists in this environment, so device-measurement work (per-RAM-tier size caps, real Lighthouse/install-prompt checks) never ran — those items were completed virtually instead, using Playwright as the verification substitute, at the user's explicit request: the prompt library shipped with real Playwright coverage against the real engine, tool calling was spiked against a real downloaded model and declined with evidence, and embeddings/multimodal/model-comparison were deferred or declined. CI-checkable audits, performance, and licence-liveness checks are done, re-scoped from manual/on-device checks to "measured via Playwright, not a physical device". A mobile-usability pass also found and fixed two real layout bugs (the composer scrolling off-screen, the Models cards squeezing unreadably) and one real accessibility bug (Mantine's Modal close button had no accessible name). The Models screen also gained a third acquisition surface, live Hugging Face search (`src/components/HuggingFaceSearchCard.tsx`) - any public GGUF repository, not just the five curated catalog entries, feeding the same consent/pre-flight/download pipeline; verified against the real Hugging Face API in `e2e/hf-search.spec.ts`. Models with a reasoning-aware chat template (Qwen3, DeepSeek-R1 distills, QwQ) also get a collapsible "thinking" trace, separate from the answer (see "Reasoning" below).

Run it locally: `npm install && npm run dev`. Full check: `npm run build && npm run lint && npm run test && npm run test:e2e`.

## Where things are

| Path | What |
|---|---|
| [.claude/skills/](.claude/skills/) | Four project skills — engineering, inference/storage, design system, state/testing |
| `src/engine/` | Worker-hosted wllama; the only module that imports `@wllama/wllama` |
| `src/models/` | Catalog, both local-file acquisition paths, download manager, eviction recovery |
| `src/db/` | IndexedDB via `idb` — conversations, messages, settings, installed models, file handles |
| `src/sw.ts` | Precaching + COOP/COEP synthesis + CORP injection + explicit update flow |
| `src/models/huggingfaceSearch.ts` | Browses one Hugging Face repo (`ggml-org/models`, by instruction) - no proxy, direct browser fetch (see below) |
| `src/models/opfsWriteWorker.ts` | OPFS writes for the local-file path, run in a worker - Safari has no main-thread `createWritable()` (see "Real Safari bugs found" below) |
| `src/types/errors.ts` (`withOpfsHint`) | Appends an actionable hint to any error that matches Safari's exact OPFS-unavailable wording |
| `src/components/thinking.ts` + `ThinkingBlock.tsx` | Parses and renders a reasoning model's `<think>` trace as a collapsible block, separate from the answer |
| `e2e/` | Playwright specs, including a real end-to-end chat flow against the committed GGUF fixture |

## Why there is no Cloudflare proxy

There isn't one, by design - a deliberate decision made early in this project that holds up under
real testing. Hugging Face serves both the model
`resolve/` download endpoints and the `api/models` search/detail endpoints with CORS that reflects
the request's `Origin` header (verified with `curl -H "Origin: ..."` against several real origins,
including a `github.io`-style one) - functionally open to any origin for an unauthenticated GET.
Downloads go straight from the browser to Hugging Face (`src/engine/modelManager.ts`,
`src/models/downloadManager.ts`); browsing goes straight from the browser to the same host
(`src/models/huggingfaceSearch.ts`), restricted to one repository - `ggml-org/models` - by
instruction, not the full hub. `src/sw.ts` adds a `Cross-Origin-Resource-Policy` header to
cross-origin model responses once the app is isolated, which is a header *addition*, not a proxy -
it never touches the request, only relabels the response so `credentialless` COEP does not reject
it. A proxy would mean bandwidth costs scaling with users and a licence question this project
avoids by fetching from the original repository. A proxy would become worth it if Hugging Face
starts rate-limiting this traffic pattern, if the project needs to serve its own converted or
split GGUFs, or if download analytics become a requirement - none of which apply today.

## Real Safari bugs found (from actual iOS/macOS testing, not this environment)

Real-device testing surfaced bugs Playwright's WebKit build could not have caught (see "Known
gaps" below for why).

**1. Local file load failed with "the operation failed for an unknown transient reason (e.g. out
of memory)" — fixed.** Confirmed root cause: **Safari does not implement
`FileSystemFileHandle.createWritable()` at all** — the async writable-stream API
`src/models/opfs.ts` called directly on the main thread. Safari only supports the *synchronous*
`FileSystemSyncAccessHandle` API, and the spec restricts that to dedicated workers. Fixed by
moving the write path into `src/models/opfsWriteWorker.ts`, mirroring the exact pattern
`@wllama/wllama` already uses internally for its own download writes (confirmed by reading its
installed source: `node_modules/@wllama/wllama/src/storage/opfs.ts` and
`workers-code/opfs-utils.js`).

**2. Catalog download also failed with the identical `UnknownError`** (console log from a
real-device report: `toEngineError (modelManager.ts:31)` ← `downloadModelShards`) - surfacing even
though `@wllama/wllama`'s download path already uses the same worker-safe write pattern as #1 and
already degrades gracefully if its own pre-flight cache check hits an OPFS error. Both failures
sharing the exact same error text, on both a worker-based path and (previously) a main-thread
path, points at something more fundamental than "wrong API used": **Safari's Private Browsing
mode blocks OPFS entirely** - the API stays present (so a plain `typeof` feature-detect reports it
as available) but throws this exact error the instant it's actually called, in *any* context,
worker included. Confirmed this matches real Safari's documented behavior.

Fixed in two parts, since no client-side code can make Private Browsing grant OPFS access:

- `src/engine/capabilities.ts`'s OPFS check now actually calls `navigator.storage.getDirectory()`
  instead of only checking that the function exists, so the app's own capability probe correctly
  reports OPFS as unavailable in this situation instead of wrongly reporting it as fine.
- The Models screen shows a clear, dedicated warning the moment that's detected (rather than
  after a failed download or copy), naming Private Browsing as the most likely cause and
  suggesting a regular window. Verified with a real Playwright test that reproduces the exact
  Safari failure signature (`e2e/opfs-unavailable.spec.ts`).
- Every error message that could plausibly be this cause (local-file copy, catalog/Hugging Face
  download, model load) now appends the same actionable hint when the underlying error matches
  WebKit's exact wording (`src/types/errors.ts`'s `withOpfsHint`), instead of only a generic
  sentence - and the real underlying error is now logged to the console either way
  (`src/engine/modelManager.ts`, `src/engine/mapError.ts`), for whatever this doesn't cover.

## Reasoning ("thinking") mode

Every model is loaded with `jinja: true`, `reasoning: true`,
`reasoning_format: 'deepseek-legacy'`, and `default_template_kwargs: { enable_thinking: true }`
(`src/engine/worker.ts`). Models without a reasoning-aware chat template (the committed test
fixture included) just ignore these and behave exactly as before. Models that do support it
(Qwen3, DeepSeek-R1 distills, QwQ) emit their reasoning inline as `<think>...</think>` ahead of the
real answer - `deepseek-legacy` was chosen specifically because it keeps that trace inside the
plain `content` stream rather than a separate `reasoning_content` field, which this project's
`AsyncIterable<string>` chat pipeline (`src/engine/client.ts`) has no way to carry.
`src/components/thinking.ts`'s `parseThinking()` splits the trace back out client-side, streaming
-aware (it reports `isThinking: true` while the block is still open), and
`src/components/ThinkingBlock.tsx` renders it as a collapsible "Thinking…" section that collapses
automatically once the real answer starts.

## Stack

Vite + TypeScript strict + React + Mantine + `idb` + Workbox, with `@wllama/wllama` for inference. Deployed static to GitHub Pages.

## Targets

iOS, Windows, and Android, all first-class. The iOS floor is anything running iOS 26 — iPhone SE 2nd gen and iPhone 11 upward. Model budget is 1 GB, gated per device RAM tier.

## Known gaps

- No physical devices were available for manual on-device verification — every per-RAM-tier size cap and `n_ctx` default in `src/models/deviceTiers.ts` is a provisional estimate, not a measurement.
- No live GitHub Pages deployment exists yet, so deployed-only criteria (install prompt, Lighthouse, real HF network behavior under isolation) are unverified.
- Playwright's bundled WebKit build cannot use OPFS in this environment (`navigator.storage.getDirectory()` throws outright, confirmed headed and headless) — every OPFS-dependent spec skips on that project and is documented inline. This was previously assumed to be purely a Playwright-WebKit quirk unrelated to real Safari; real-device testing proved that assumption wrong for a related but distinct reason (see "Real Safari bugs found" above) — Playwright's WebKit and real Safari fail at different points (`getDirectory()` itself vs. `createWritable()`), but neither one is a testing artifact to wave off.
- The prompt library shipped without a device-verified baseline behind it, on explicit instruction; embeddings, multimodal, and model-comparison work remain deferred or declined for the same reason.
