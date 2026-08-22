# gguf-pwa

A browser-local LLM client. Downloads or opens a quantized llama.cpp GGUF model and runs inference entirely on the user's device via WebAssembly and WebGPU.

**No inference server, no API key, no telemetry.** After the weights land, no request leaves the browser.

The one exception is opt-in and off by default: an **online API** backend you can switch on in Settings and pick in the same model switcher as your downloaded models. While it is selected, your prompts do leave the device. See "Optional online API" below.

## Status

Core chat/model-management flow implemented and passing CI (build, lint, Vitest, Playwright across Chromium/Firefox/WebKit). No physical iPhone/Android/Windows hardware exists in this environment, so device-measurement work (per-RAM-tier size caps, real Lighthouse/install-prompt checks) never ran — those items were completed virtually instead, using Playwright as the verification substitute, at the user's explicit request: the prompt library shipped with real Playwright coverage against the real engine, tool calling was spiked against a real downloaded model and declined with evidence, and embeddings/multimodal/model-comparison were deferred or declined. CI-checkable audits, performance, and licence-liveness checks are done, re-scoped from manual/on-device checks to "measured via Playwright, not a physical device". A mobile-usability pass also found and fixed two real layout bugs (the composer scrolling off-screen, the Models cards squeezing unreadably) and one real accessibility bug (Mantine's Modal close button had no accessible name). The Models screen also gained a third acquisition surface, live Hugging Face search (`src/components/HuggingFaceSearchCard.tsx`) - any public GGUF repository, not just the five curated catalog entries, feeding the same consent/pre-flight/download pipeline; verified against the real Hugging Face API in `e2e/hf-search.spec.ts`. Models with a reasoning-aware chat template (Qwen3, DeepSeek-R1 distills, QwQ) also get a collapsible "thinking" trace, separate from the answer (see "Reasoning" below).

Run it locally: `npm install && npm run dev`. Full check: `npm run build && npm run lint && npm run test && npm run test:e2e`, plus `npm run check:no-telemetry` and `npm run verify:pwa` against a built `dist/`.

## Deploying

Build and publish the static site to GitHub Pages manually:

```bash
npm run build
npx gh-pages -d dist
```

The live site is [https://netuserhub.github.io/gguf-pwa/](https://netuserhub.github.io/gguf-pwa/). After publishing, verify the deployed PWA with the live URL:

```bash
PWA_URL=https://netuserhub.github.io/gguf-pwa/ npm run verify:pwa
```

## Chat tools (attachments)

The composer accepts text files, PDFs, images, and video, **gated on what the loaded model actually reports**. After a model loads, `src/engine/worker.ts` calls wllama's `supportInputModality('image')` against the loaded GGUF and reports it up through `useChatEngine`; the composer narrows its `accept` list from that, so a text-only build of a vision architecture never offers an image picker it would silently drop.

| Kind | How it reaches the model | Needs a vision model |
|---|---|---|
| `.txt/.md/.csv/.json/.log` | Extracted text, wrapped in a `<file name="…">` block ahead of your question | No |
| `.pdf` | Text extracted per page via `pdfjs-dist` (dynamically imported, so it stays out of the initial bundle) | No |
| Image | Raw bytes as a wllama image content part | Yes |
| Video | **Sampled frames.** wllama has no video modality at all, so `src/chat/videoFrames.ts` decodes the clip through an `HTMLVideoElement`, seeks to 8 evenly spaced slice midpoints, and sends JPEG frames scaled to 384px — the form video-trained checkpoints like SmolVLM2 were trained on | Yes |

Image bytes are deliberately **not** persisted in the transcript — binary blobs in IndexedDB is the same mistake as storing weights there. Only a name and kind survive, so regenerating a turn that carried an image re-sends the text only.

## Optional online API

Off by default. Everything above stays true until someone switches this on in **Settings > Online API**, reads the warning, and then picks "Online API (no download)" in the model switcher.

It exists so the app is usable before a gigabyte of weights has finished downloading, and on a device too small to run anything worthwhile locally. It is a peer of the downloaded models, not a replacement: the engine holds one backend at a time, and selecting either releases the other.

| | |
|---|---|
| Primary | `https://text.pollinations.ai/{prompt}` - keyless, returns `text/plain`, streamed to the transcript as it arrives |
| Fallback | `https://prexzyapis.com/ai/ai4chat?prompt={prompt}` - keyless, returns JSON; the reply is pulled out of the body |
| Order | Index 0 is primary. A later entry is tried **only** when the one before it failed before producing any output, so a half-rendered reply is never silently restarted somewhere else |
| Where | `src/engine/remote.ts`, behind the same `src/engine/` barrel as the wllama worker - nothing above `src/engine/` knows which backend answered |

**The `{prompt}` token is where the message goes**, URI-encoded. Both endpoints take a single string rather than a role array, so `flattenMessages()` sends a first turn bare and labels anything longer as a transcript.

**Known-bad providers are treated as failures.** `prexzyapis.com/ai/ai4chat` currently answers HTTP 200 with a success-shaped body whose reply slot reads `"Invalid Request"` for every prompt - its upstream AI4Chat service is broken as of this writing, though the endpoint itself is reachable and correctly parameterized. `isNonReply()` in `src/engine/remote.ts` catches that class of response so it fails over instead of being rendered as the assistant's answer.

**Endpoints are editable, hosts are not.** `REMOTE_API_HOSTS` in [src/types/remote.ts](src/types/remote.ts) is the single source for three things that must agree: the `connect-src` in `index.html` (substituted at build time by `vite.config.ts`), the CORP re-serve in `src/sw.ts`, and the validation in Settings. GitHub Pages cannot set response headers, so the CSP is a meta tag and cannot change at runtime - a host outside that list is unreachable no matter what is stored. Settings rejects one with that reason rather than saving a value that would die in the console. Adding a provider host is a one-line change there plus the matching entry in `scripts/check-no-telemetry.sh`.

**No key lives in this repo, and none can.** Both defaults are keyless precisely because the site is public and fully static - anything shipped to the browser is readable by anyone.

### Next step (deferred): a Cloudflare Worker for a keyed API

Not built. Recorded here so the shape is settled before anyone starts.

A better online model needs an authenticated API, and this app cannot hold a key - it is a public static site, so any key in the bundle is public too. The key goes in a Cloudflare Worker that proxies the request instead:

1. Worker holds the upstream key as a secret (`wrangler secret put`), accepts a prompt, calls the upstream, streams the reply back.
2. Add the Worker's hostname to `REMOTE_API_HOSTS` in [src/types/remote.ts](src/types/remote.ts) - that one line reaches the CSP, the service worker, and the Settings validation.
3. Add the same host to the `connect-src` allow-list in `scripts/check-no-telemetry.sh`, or the build fails on purpose.
4. Add it to `DEFAULT_REMOTE_PROVIDERS` as the new index 0, demoting the keyless endpoints to fallbacks.

Nothing in `src/engine/remote.ts` needs to change: a Worker is just another provider with a `{prompt}` template. Note the Worker must set permissive CORS, and it is the first piece of this project with a running cost and an abuse surface - rate limiting is part of the work, not a follow-up. This is also the only place a proxy is warranted; *model downloads* still need none (see "Why there is no Cloudflare proxy" below).

Covered by `src/engine/remote.test.ts`, `src/types/remote.test.ts`, and `e2e/remote-api.spec.ts`, which intercepts every request - the suite never touches the real third-party services.

## Auditing with Lighthouse

Lighthouse is **not a project dependency, by design** — it pulls ~157 packages including `puppeteer-core` and `@puppeteer/browsers`, which can download Chrome binaries. Run it ad-hoc instead, against Playwright's already-installed Chromium so no system Chrome and no new browser is involved:

```bash
npm run build && npm run preview          # serves dist/ on :4173
npx --yes lighthouse@13 http://localhost:4173/gguf-pwa/ \
  --chrome-flags="--headless" --output=html --output-path=./lh.html
```

`npx --yes` resolves it into the npx cache for that run only; nothing is written to `package.json` or `package-lock.json`. Delete `lh.html` when done — it is not gitignored as a build artifact.

Findings already fixed from a prior run (73 → 79 performance, 92 → 100 accessibility): the `user-scalable=no` viewport attribute was dropped (zoom is suppressed by `src/pwa/preventPinchZoom.ts`, which is what actually works — Samsung Internet ignores the meta tag); Models and Settings were split behind `lazy()` while **Chat deliberately was not**, since it is the landing route and splitting it only added a second network hop; and an inline boot shell in `index.html` gives a real first paint before React parses. Render-blocking Mantine CSS remains unfixed on purpose: the standard `media="print" onload=…` swap is an inline event handler, which this app's CSP blocks.

## No telemetry, enforced

The "no telemetry" claim is checked, not asserted. `npm run check:no-telemetry` runs against `dist/` and fails if the build gains an analytics host, a `navigator.sendBeacon` call, or a `connect-src` wider than the weight hosts plus the two declared online API hosts. Those two are inference endpoints the user opts into, not telemetry: nothing is sent unless the online API is switched on, selected as the backend, and a message is typed. It runs against the build rather than the source because a transitive dependency can add a phone-home with no source file changing — `vite-plugin-pwa` pulls in `workbox-google-analytics`, which this proves stays unbundled.

`.npmrc` also disables npm's `fund`, `update-notifier`, and install-time `audit` (the last is an automatic dependency-tree upload; run `npm audit` deliberately when vetting a new dependency).

## Where things are

| Path | What |
|---|---|
| [.claude/skills/](.claude/skills/) | Four project skills — engineering, inference/storage, design system, state/testing |
| `src/engine/` | Worker-hosted wllama; the only module that imports `@wllama/wllama` |
| `src/models/` | Catalog, both local-file acquisition paths, download manager, eviction recovery |
| `src/models/downloadQueue.ts` | App-wide download queue — jobs run serially and survive navigating away from Models |
| `src/chat/attachments.ts` + `videoFrames.ts` | Attachment extraction: text, PDF, image bytes, and video sampled into frames |
| `scripts/check-no-telemetry.sh` | Fails the build if `dist/` gains an analytics host, a beacon, or a widened `connect-src` |
| `scripts/verify-pwa.mjs` | Proves SW control, manifest validity, WASM compile, and offline cold start via Playwright's Chromium |
| `src/db/` | IndexedDB via `idb` — conversations, messages, settings, installed models, file handles |
| `src/sw.ts` | Precaching + COOP/COEP synthesis + CORP injection + explicit update flow |
| `src/engine/remote.ts` | The opt-in online API backend - ordered providers, fallback, failure-sentinel guard (see "Optional online API") |
| `src/types/remote.ts` | `REMOTE_API_HOSTS` - one list feeding the CSP, the SW, and the Settings validation |
| `scripts/generate-icons.mjs` | Rasterizes the app mark into the PNG icon sizes iOS and Android honour (see "PWA icons") |
| `src/models/persistentStorage.ts` | Bounded `navigator.storage.persist()` - Firefox never settles it (see "The Firefox bug that froze every local-file install") |
| `src/models/downloadQueue.ts` | One serial download queue for the session; cancel marks the job cancelled synchronously so an immediate retry is not swallowed |
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

The optional online API is the one place a Worker would eventually earn its keep, and for a
different reason: not CORS, but secrecy. Both shipped endpoints are keyless, so today the browser
calls them directly. An authenticated API cannot work that way - this site is public and static,
so any key in the bundle is public too. The key would live in a Cloudflare Worker that proxies the
request, and `REMOTE_API_HOSTS` would gain the Worker's hostname. That is a change to the online
API path only; model downloads still need no proxy.

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

## The Firefox bug that froze every local-file install

Worth the same treatment as the Safari section above, because the symptom pointed nowhere near the cause.

Picking a local GGUF on Firefox sat on **"Copying into on-device storage - 0%" forever**. OPFS was not the problem: `navigator.storage.getDirectory()` works there, and the write worker was never reached. The copy had not started.

`src/hooks/useLocalFileLoad.ts` awaited `requestPersistentStorage()` before writing, so the grant would be in place before several hundred megabytes landed. **Firefox answers `navigator.storage.persist()` with a permission doorhanger and leaves the promise pending until the user decides - forever if they never do.** Measured directly: the call never settles on Firefox, while Chromium resolves it in about 4ms without prompting at all. A best-effort request was holding the whole install hostage.

Three fixes, all in place:

1. `src/models/persistentStorage.ts` bounds the wait and returns a third outcome, `undecided`, distinct from `denied` - the browser is still asking, which is not a refusal. The underlying request stays live, so a late answer is still recorded; it just no longer blocks anything. Covered by `src/models/persistentStorage.test.ts`.
2. Settings says so in words when the answer is `undecided`, instead of claiming the browser declined.
3. `src/models/opfs.ts` now listens for `error` and `messageerror` on the write worker. A worker that fails to load fires `error` and sends no message, which was another way to hang that promise forever with no way to tell a slow copy from a dead worker.

This was hiding eleven Playwright failures on the Firefox project - chat-flow, models-local-file, clear-site-data, prompt-library, pwa-offline, mobile-shots and the system-prompt-modal a11y case - none of which had anything to do with the thing they were testing. They all install the fixture first.

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

## PWA icons

`public/favicon.svg` alone was not enough. **iOS ignores an SVG `apple-touch-icon`**, and with no usable one declared, Safari falls back to `/apple-touch-icon.png` at the *origin root* - which on a `github.io` account is whatever another project published there. That is why this app showed a different app's icon on the iOS home screen.

The fix is real PNGs: `apple-touch-icon.png` (180x180), `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (drawn inside Android's ~80% safe zone), declared in `index.html` and `public/manifest.webmanifest`. Regenerate them with `node scripts/generate-icons.mjs`, which rasterizes the mark through the Chromium that `@playwright/test` already vendors - no new dependency, and the PNGs are committed so a normal build never runs it.

## Stack

Vite + TypeScript strict + React + Mantine + `idb` + Workbox, with `@wllama/wllama` for inference. Deployed static to GitHub Pages.

## Targets

iOS, Windows, and Android, all first-class. The iOS floor is anything running iOS 26 — iPhone SE 2nd gen and iPhone 11 upward. Model budget is 1 GB, gated per device RAM tier.

## Known gaps

- No physical devices were available for manual on-device verification — every per-RAM-tier size cap and `n_ctx` default in `src/models/deviceTiers.ts` is a provisional estimate, not a measurement.
- Lighthouse and `verify:pwa` have only been run against a local `vite preview`, never the live Pages URL. Localhost numbers carry simulated throttling and no real TLS/CDN latency, so re-run both against the deployed site (see "Deploying" above) before trusting them.
- `src/chat/videoFrames.ts` has no test coverage: frame extraction needs a real video decode, which jsdom cannot do. It has never been observed running.
- The image and video tools are unverified end to end — that needs a vision GGUF (`smolvlm-256m-instruct-q8` or either SmolVLM2 Video entry in the catalog) loaded on a real device.
- Pinch zoom is suppressed deliberately (`src/pwa/preventPinchZoom.ts`), at explicit request. This is a knowing WCAG 1.4.4 trade-off, not an oversight. The viewport meta tag carries no `user-scalable=no`: it is redundant with the JS blocker, changes behaviour on no real device, and costs an axe `meta-viewport` failure on every screen. It was re-added in 48c238e and removed again for that reason.
- The online API has been exercised against the real Pollinations endpoint by hand and against intercepted routes in CI. The prexzyapis fallback has never returned a usable reply, because its upstream is broken (see "Optional online API").
- Playwright's bundled WebKit build cannot use OPFS in this environment (`navigator.storage.getDirectory()` throws outright, confirmed headed and headless) — every OPFS-dependent spec skips on that project and is documented inline. This was previously assumed to be purely a Playwright-WebKit quirk unrelated to real Safari; real-device testing proved that assumption wrong for a related but distinct reason (see "Real Safari bugs found" above) — Playwright's WebKit and real Safari fail at different points (`getDirectory()` itself vs. `createWritable()`), but neither one is a testing artifact to wave off.
- The prompt library shipped without a device-verified baseline behind it, on explicit instruction; embeddings, multimodal, and model-comparison work remain deferred or declined for the same reason.
