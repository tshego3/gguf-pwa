# gguf-pwa

A browser-local LLM client. Downloads or opens a quantized llama.cpp GGUF model and runs inference entirely on the user's device via WebAssembly and WebGPU.

**No inference server, no API key, no telemetry.** After the weights land, no request leaves the browser.

The one exception is opt-in and off by default: an **online API** backend you can switch on in Settings and pick in the same model switcher as your downloaded models. While it is selected, your prompts do leave the device - to this project's own keyed Cloudflare Worker if one is deployed, and otherwise to two keyless public endpoints. See "Optional online API" below.

**No key is in the bundle, and none can be.** A public static site cannot hold a secret. The keyed providers are reached through [worker/](worker/), which holds the keys on its own side; the app itself ships nothing but a hostname.

## Status

Core chat/model-management flow implemented and passing CI (build, lint, Vitest, Playwright across Chromium/Firefox/WebKit). No physical iPhone/Android/Windows hardware exists in this environment, so device-measurement work (per-RAM-tier size caps, real Lighthouse/install-prompt checks) never ran — those items were completed virtually instead, using Playwright as the verification substitute, at the user's explicit request: the prompt library shipped with real Playwright coverage against the real engine, tool calling was spiked against a real downloaded model and declined with evidence (it has since shipped on the *online* path only, inside the Worker - see "The keyed proxy" below; the local engine still has none), and embeddings/multimodal/model-comparison were deferred or declined. CI-checkable audits, performance, and licence-liveness checks are done, re-scoped from manual/on-device checks to "measured via Playwright, not a physical device". A mobile-usability pass also found and fixed two real layout bugs (the composer scrolling off-screen, the Models cards squeezing unreadably) and one real accessibility bug (Mantine's Modal close button had no accessible name). The Models screen also gained a third acquisition surface, live Hugging Face search (`src/components/HuggingFaceSearchCard.tsx`) - any public GGUF repository, not just the five curated catalog entries, feeding the same consent/pre-flight/download pipeline; verified against the real Hugging Face API in `e2e/hf-search.spec.ts`. Models with a reasoning-aware chat template (Qwen3, DeepSeek-R1 distills, QwQ) also get a collapsible "thinking" trace, separate from the answer (see "Reasoning" below).

Run it locally: `npm install && npm run dev`. Full check: `npm run build && npm run lint && npm run test && npm run test:e2e`, plus `npm run check:no-telemetry`, `npm run check:engine-boundary`, and `npm run verify:pwa` against a built `dist/` with `npm run preview` serving it.

`npm run test` and `npm run lint` already cover `worker/`. Its typecheck is separate, because it builds against `@cloudflare/workers-types` rather than the DOM: `cd worker && npm install && npx tsc --noEmit`.

## Deploying

Two deployables: the static PWA on GitHub Pages, and the optional keyed proxy on Cloudflare Workers.

**The order is not a preference.** The Worker's hostname is compiled into the PWA - GitHub Pages cannot set response headers, so the CSP is a build-time `<meta>` tag and a host that was not present at build time is unreachable at runtime. Deploy the Worker first, or you will build twice.

**The proxy is optional.** Skip steps 1-4 if you do not want the keyed providers. The app then works exactly as documented, and the online API falls through to its two keyless endpoints. Nothing else changes.

### 1. Get at least one API key

One is enough - a provider with no key is skipped, not attempted. [worker/README.md](worker/README.md#get-the-api-keys) has the per-provider walkthrough.

| Key | Where |
|---|---|
| `OLLAMA_API_KEY` | [ollama.com/settings/keys](https://ollama.com/settings/keys) |
| `HUGGINGFACE_API_KEY` | [a fine-grained token](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained) with **Make calls to Inference Providers**. A read token is not enough |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com) > profile > API keys |

### 2. Deploy the Worker

Two routes to the same hostname. **2A is recommended** for one reason: it is the only one that can create the rate limiting binding.

#### 2A. With wrangler

```bash
cd worker
npm install
npx wrangler login

npx wrangler secret put OLLAMA_API_KEY        # repeat per key you have
npx wrangler secret put HUGGINGFACE_API_KEY
npx wrangler secret put NVIDIA_API_KEY

npx wrangler deploy
```

Note the hostname it prints - `gguf-proxy.<your-subdomain>.workers.dev`.

#### 2B. In the Cloudflare dashboard

The dashboard editor takes a single file and this is a seven-module TypeScript project, so bundle it first:

```bash
cd worker && npm install && npm run bundle
```

That writes one self-contained ES module to `worker/dist/index.js`, about 21 KB. Nothing else in `dist/` is needed. Then:

1. **Create the Worker.** [dash.cloudflare.com](https://dash.cloudflare.com) > **Workers & Pages** > **Create** > **Start with Hello World** > **Deploy**. Rename it `gguf-proxy` if you like; the name becomes the subdomain.
2. **Paste the code.** On the Worker's page, **Edit code** (the Quick Edit browser editor). Select all of `worker.js`, replace it with the whole contents of `worker/dist/index.js`, then **Deploy**.
3. **Add the keys.** Back on the Worker: **Settings** > **Variables and Secrets** > **Add** > type **Secret** > name `OLLAMA_API_KEY`, paste the value > **Deploy**. Repeat for `HUGGINGFACE_API_KEY` and `NVIDIA_API_KEY`. Secret values are hidden afterwards in both the dashboard and wrangler; a plaintext variable would not be.
4. **Add vars only if you want to change a default.** Same screen, type **Text**, for anything in the [config table](worker/README.md#config) - model names, tool flags, `ALLOWED_ORIGINS`, `MAX_PROMPT_CHARS`. All optional: a Worker with nothing but the secrets set works.
5. **Note the hostname** shown on the Worker's overview.

**One thing the dashboard cannot do: rate limiting.** Cloudflare does not expose rate limiting bindings in the dashboard, so a Worker deployed this way has no `RATE_LIMITER` and does not throttle - leaving only `MAX_PROMPT_CHARS` and the 64-message ceiling as brakes on a proxy that costs money per request. Either run `npx wrangler deploy` once to attach the binding and use the dashboard for everything after that, or put the Worker on a custom domain and add a WAF rate limiting rule, which *is* a dashboard feature but does not work on `*.workers.dev`. [worker/README.md](worker/README.md#deploy-from-the-dashboard-instead) has the detail and the third, weaker option.

### 3. Verify the Worker before touching the PWA

```bash
curl https://gguf-proxy.<your-subdomain>.workers.dev/health
curl -N -X POST https://gguf-proxy.<your-subdomain>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hello in five words."}]}' -D -
```

`/health` lists which providers came up configured and never prints a key. The second call must stream text back; `X-Gguf-Provider` names who answered. Fix this here - debugging it through the PWA's CSP afterwards is strictly harder.

### 4. Point the PWA at it - two edits, same commit

1. `REMOTE_WORKER_HOST` in [src/types/remote.ts](src/types/remote.ts) - your hostname, no scheme, no trailing slash. That one line reaches the CSP in `index.html`, the CORP re-serve in `src/sw.ts`, and the Settings validation, and it flips the provider from inactive to enabled.
2. The matching token in [scripts/check-no-telemetry.sh](scripts/check-no-telemetry.sh) - replace the existing `https://gguf-proxy.…` entry with `https://<your hostname>`.

Miss the second and `npm run check:no-telemetry` fails, on purpose: a host reaching the CSP without a deliberate edit to the telemetry allow-list is exactly what that check exists to catch.

### 5. Build and check

```bash
npm install
npm run build
npm run lint && npm run test && npm run check:engine-boundary
npm run check:no-telemetry
```

Confirm your host actually landed in the shipped CSP:

```bash
grep -o "connect-src[^;]*" dist/index.html
```

### 6. Publish to GitHub Pages

Pushing to `main` is the normal path - [.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, typecheck, Vitest, Playwright across all three engines, then deploys `dist/` to Pages. Nothing ships if a check fails.

To publish by hand instead:

```bash
npm run build
npx gh-pages -d dist
```

Forking? `base` in [vite.config.ts](vite.config.ts) is `/gguf-pwa/` and must match your repository name, or every asset 404s.

### 7. Verify the live site

```bash
PWA_URL=https://<you>.github.io/gguf-pwa/ npm run verify:pwa
```

Thirteen checks: service worker control, manifest validity, the WASM served from your own origin and compiling, and an offline cold start.

### 8. Smoke-test the proxy end to end

On the live site: **Settings > Online API**, switch it on, confirm the primary endpoint reads your Worker's address and is **not** marked inactive. Then pick "Online API (no download)" in the model switcher and send a message. A reply means all of it is wired - key, Worker, CSP, service worker.

### Changing things later

| Change | With wrangler | In the dashboard | Rebuild the PWA? |
|---|---|---|---|
| A key | `npx wrangler secret put …` | Settings > Variables and Secrets > Add/Edit > Deploy | No |
| A model or tool flag | Edit `[vars]` in `wrangler.toml`, `npx wrangler deploy` | Same screen, type **Text** | No |
| Worker code | `npx wrangler deploy` from `worker/` | `npm run bundle`, then Edit code > paste > Deploy | No |
| The Worker's hostname | Steps 4-7 again | Steps 4-7 again | **Yes** - it is the one thing baked into the build |

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
| Primary | The project's own Cloudflare Worker ([worker/](worker/)) - holds the keys for Ollama, Hugging Face and NVIDIA NIM, walks that chain server-side, streams `text/plain` back. Deployed at `gguf-proxy.feeds-pwa.workers.dev`; point `REMOTE_WORKER_HOST` at a `.invalid` host to switch it off |
| Fallback 1 | `https://text.pollinations.ai/{prompt}` - keyless, returns `text/plain`, streamed to the transcript as it arrives |
| Fallback 2 | `https://prexzyapis.com/ai/ai4chat?prompt={prompt}` - keyless, returns JSON; the reply is pulled out of the body |
| Order | Index 0 is primary. A later entry is tried **only** when the one before it failed before producing any output, so a half-rendered reply is never silently restarted somewhere else |
| Where | `src/engine/remote.ts`, behind the same `src/engine/` barrel as the wllama worker - nothing above `src/engine/` knows which backend answered |

**The `{prompt}` token is where the message goes**, URI-encoded. The two keyless endpoints take a single string rather than a role array, so `flattenMessages()` sends a first turn bare and labels anything longer as a transcript.

**The Worker is the exception: it is POSTed to, not templated.** It receives the real role array in a JSON body, because a chat-completions upstream answers better with roles than with a flattened transcript, and because a conversation carrying extracted attachment text does not fit inside a URL. `checkRemoteEndpoint()` validates a `POST` address for the *absence* of `{prompt}` and a `GET` address for its presence.

**A stored provider list is a snapshot, so it is merged rather than restored.** Settings persist as one object; a plain reload would pin an existing install to the providers that existed when it last wrote, and a new primary would never reach anyone who had opened the app before. `mergeRemoteProviders()` takes the shape from this build and only the two editable fields - the address and the enabled flag - from storage.

**A failure arrives as words, not a status code.** `remoteStatusMessage()` in `src/engine/remote.ts` maps each HTTP status to one plain sentence: an expired key says so, a spent monthly allowance says so, a rate limit says how long to wait, and a timeout points at the offline path, which is the one case where the app has a genuinely better answer to offer. A retry is only suggested where retrying can actually help - a dead key and a spent credit do not get better by trying again, and saying otherwise wastes the user's time.

Two rules hold this together. **The provider's response body never reaches the screen** - it is a third party's text, so only the bounded status code is read. And when every provider in the ordered list fails, the reported failure is the **most actionable one, not the last one**: a primary dying of an expired key followed by two generic fallback failures must not bury the only sentence anyone can act on. `mostActionable()` ranks them, and a tie keeps the earlier provider.

**Known-bad providers are treated as failures.** `prexzyapis.com/ai/ai4chat` currently answers HTTP 200 with a success-shaped body whose reply slot reads `"Invalid Request"` for every prompt - its upstream AI4Chat service is broken as of this writing, though the endpoint itself is reachable and correctly parameterized. `isNonReply()` in `src/engine/remote.ts` catches that class of response so it fails over instead of being rendered as the assistant's answer.

**Endpoints are editable, hosts are not.** `REMOTE_API_HOSTS` in [src/types/remote.ts](src/types/remote.ts) is the single source for three things that must agree: the `connect-src` in `index.html` (substituted at build time by `vite.config.ts`), the CORP re-serve in `src/sw.ts`, and the validation in Settings. GitHub Pages cannot set response headers, so the CSP is a meta tag and cannot change at runtime - a host outside that list is unreachable no matter what is stored. Settings rejects one with that reason rather than saving a value that would die in the console. Adding a provider host is a one-line change there plus the matching entry in `scripts/check-no-telemetry.sh`.

**No key lives in this repo, and none can.** The site is public and fully static, so anything shipped to the browser is readable by anyone. The two keyless endpoints need no key at all; the keyed providers are reached through a proxy that holds the keys on its own side, and the app ships only its hostname.

### The keyed proxy: a Cloudflare Worker

Built, in [worker/](worker/), with its own README covering where to get each of the three API keys, deploy, config, verification and the abuse surface. All three services have a free tier ([ollama.com/settings/keys](https://ollama.com/settings/keys), [a fine-grained HF token with Inference Providers permission](https://huggingface.co/settings/tokens), [build.nvidia.com](https://build.nvidia.com)), and any one of them is enough - a provider with no key is skipped, not attempted. It is not part of the static build and is deployed separately - `npx wrangler deploy`, or `npm run bundle` in `worker/` and paste the one resulting file into the Cloudflare dashboard editor. The dashboard route works for everything except the rate limiting binding, which Cloudflare exposes only through wrangler; `worker/README.md` covers the three ways around that.

A better online model needs an authenticated API, and this app cannot hold a key - it is a public static site, so any key in the bundle is public too. The key lives in the Worker instead, which proxies the request:

| Order | Service | Default model |
|---|---|---|
| 1 | Ollama Cloud | `gpt-oss:120b` |
| 2 | Hugging Face Router | `meta-llama/Llama-3.3-70B-Instruct` |
| 3 | NVIDIA NIM | `meta/llama-3.3-70b-instruct` |
| 4, 5 | The two keyless endpoints above, in the browser | - |

All three keyed services speak the OpenAI chat-completions shape, so there is one adapter and a provider is a URL, a model and a key. Any non-2xx moves to the next: `429` is the exhausted quota this chain exists for, `401`/`403` is a dead key, `5xx` is an upstream fault, and all three mean the same thing to the caller. A provider with no key configured is skipped rather than attempted. When all three are gone the Worker answers `502`, and the browser falls through to the keyless pair - so nobody sees an error until five providers have failed.

**Tool calling runs in the Worker, not the browser.** Tools are offered to any model that accepts them; a model that rejects a `tools` array is retried once without one on the same provider rather than burning a provider that still has quota. The loop is bounded at three rounds and the last round never offers tools. Two tools ship: `get_current_time`, and `fetch_url` which is **off by default** because a public proxy that fetches arbitrary URLs on request is an SSRF surface rather than a feature. The PWA sends a conversation and receives text; it never learns that a tool ran.

`reasoning_content`, which NVIDIA and DeepSeek-family models return as a separate field, is re-emitted wrapped in `<think></think>` - the marker `src/components/thinking.ts` already parses, so an online reasoning trace lands in the same collapsible block as a local one.

**Deploying it needs two edits in the same commit**, or the build fails on purpose:

1. `REMOTE_WORKER_HOST` in [src/types/remote.ts](src/types/remote.ts) - that one line reaches the CSP, the service worker, and the Settings validation, and flips the provider from inactive to enabled.
2. The matching token in `scripts/check-no-telemetry.sh`.

`REMOTE_WORKER_HOST` is `gguf-proxy.feeds-pwa.workers.dev` today. Pointing it at any `.invalid` host - the RFC 2606 TLD that can never resolve - is how the proxy is switched off: the provider then ships disabled, no request is aimed at it, and the online path falls through to the keyless pair. This is the only place a proxy is warranted; *model downloads* still need none (see "Why model downloads have no Cloudflare proxy" below).

It is also the first piece of this project with a running cost and an abuse surface, so throttling is in the request path, not on a list of follow-ups: Workers' built-in rate limiter at 20 requests per minute per IP, a 24000-character prompt cap and a 64-message ceiling checked before any upstream call, a 60s upstream timeout, and a 512 KB cap on a single SSE line.

Covered by `src/engine/remote.test.ts`, `src/types/remote.test.ts`, `worker/src/*.test.ts`, and `e2e/remote-api.spec.ts`, which intercepts every request - the suite never touches the real services, keyed or keyless.

## Auditing with Lighthouse

Lighthouse is **not a project dependency, by design** — it pulls ~157 packages including `puppeteer-core` and `@puppeteer/browsers`, which can download Chrome binaries. Run it ad-hoc instead, against Playwright's already-installed Chromium so no system Chrome and no new browser is involved:

```bash
npm run build && npm run preview          # serves dist/ on :4173
npx --yes lighthouse@13 http://localhost:4173/gguf-pwa/ \
  --chrome-flags="--headless" --output=html --output-path=./lh.html
```

`npx --yes` resolves it into the npx cache for that run only; nothing is written to `package.json` or `package-lock.json`. Delete `lh.html` when done — it is not gitignored as a build artifact.

Findings already fixed from a prior run (73 → 79 performance): Models and Settings were split behind `lazy()` while **Chat deliberately was not**, since it is the landing route and splitting it only added a second network hop; and an inline boot shell in `index.html` gives a real first paint before React parses. Render-blocking Mantine CSS remains unfixed on purpose: the standard `media="print" onload=…` swap is an inline event handler, which this app's CSP blocks.

## No telemetry, enforced

The "no telemetry" claim is checked, not asserted. `npm run check:no-telemetry` runs against `dist/` and fails if the build gains an analytics host, a `navigator.sendBeacon` call, or a `connect-src` wider than the weight hosts plus the three declared online API hosts. Those three are inference endpoints the user opts into, not telemetry: nothing is sent unless the online API is switched on, selected as the backend, and a message is typed. It runs against the build rather than the source because a transitive dependency can add a phone-home with no source file changing — `vite-plugin-pwa` pulls in `workbox-google-analytics`, which this proves stays unbundled.

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
| `src/engine/remote.ts` | The opt-in online API backend - ordered providers, fallback, failure-sentinel guard, and the GET/POST split (see "Optional online API") |
| `src/types/remote.ts` | `REMOTE_API_HOSTS` and `REMOTE_WORKER_HOST` - one list feeding the CSP, the SW, and the Settings validation, plus `mergeRemoteProviders()` so a stored list cannot pin an install to old providers |
| [worker/](worker/) | The keyed Cloudflare Worker - Ollama then Hugging Face then NVIDIA NIM, with server-side tool calling. Deployed separately; not part of the static build. Its own README covers deploy, config and the abuse surface |
| `scripts/generate-icons.mjs` | Rasterizes the app mark into the PNG icon sizes iOS and Android honour (see "PWA icons") |
| `src/models/persistentStorage.ts` | Bounded `navigator.storage.persist()` - Firefox never settles it (see "The Firefox bug that froze every local-file install") |
| `src/models/downloadQueue.ts` | One serial download queue for the session; cancel marks the job cancelled synchronously so an immediate retry is not swallowed |
| `src/models/huggingfaceSearch.ts` | Browses one Hugging Face repo (`ggml-org/models`, by instruction) - no proxy, direct browser fetch (see below) |
| `src/models/opfsWriteWorker.ts` | OPFS writes for the local-file path, run in a worker - Safari has no main-thread `createWritable()` (see "Real Safari bugs found" below) |
| `src/types/errors.ts` (`withOpfsHint`) | Appends an actionable hint to any error that matches Safari's exact OPFS-unavailable wording |
| `src/components/thinking.ts` + `ThinkingBlock.tsx` | Parses and renders a reasoning model's `<think>` trace as a collapsible block, separate from the answer |
| `e2e/` | Playwright specs, including a real end-to-end chat flow against the committed GGUF fixture |

## Why model downloads have no Cloudflare proxy

They don't, by design - a deliberate decision made early in this project that holds up under
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

The optional online API is the one place a Worker does earn its keep, and for a different reason:
not CORS, but secrecy. The two keyless endpoints are called directly from the browser. An
authenticated API cannot work that way - this site is public and static, so any key in the bundle
is public too. That is what [worker/](worker/) is for, and it is the whole of it: a keyed inference
proxy holding the Ollama, Hugging Face and NVIDIA keys on its own side, reached as one more entry
in `REMOTE_API_HOSTS`. It touches the online API path only. **Model downloads still need no proxy,
and adding one would still be a mistake** - the reasoning above is unchanged by the Worker's
existence.

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
- Pinch zoom is suppressed deliberately, at explicit request, by two mechanisms on purpose: `maximum-scale`/`user-scalable=no` on the viewport meta tag, which stops zoom before any JavaScript parses in the browsers that honour it, and `src/pwa/preventPinchZoom.ts`, which covers the ones that ignore the tag (Samsung Internet confirmed). This is a knowing WCAG 1.4.4 trade-off, not an oversight, and it costs an axe `meta-viewport` violation on every screen. `e2e/a11y.spec.ts` excludes that single rule and keeps enforcing every other one, so the suite stays green without the accessibility check being weakened anywhere else.
- The online API has been exercised against the real Pollinations endpoint by hand and against intercepted routes in CI. The prexzyapis fallback has never returned a usable reply, because its upstream is broken (see "Optional online API").
- Playwright's bundled WebKit build cannot use OPFS in this environment (`navigator.storage.getDirectory()` throws outright, confirmed headed and headless) — every OPFS-dependent spec skips on that project and is documented inline. This was previously assumed to be purely a Playwright-WebKit quirk unrelated to real Safari; real-device testing proved that assumption wrong for a related but distinct reason (see "Real Safari bugs found" above) — Playwright's WebKit and real Safari fail at different points (`getDirectory()` itself vs. `createWritable()`), but neither one is a testing artifact to wave off.
- The prompt library shipped without a device-verified baseline behind it, on explicit instruction; embeddings, multimodal, and model-comparison work remain deferred or declined for the same reason.
