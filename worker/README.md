# gguf-proxy

The keyed online API for [gguf-pwa](../README.md). A single Cloudflare Worker that holds three upstream keys and answers one streamed `text/plain` body.

It exists because the PWA is a public static site: anything in the bundle is readable by anyone, so the app cannot hold a key. The Worker holds them instead and is the only part of this project with a running cost.

**Deploying both sides for the first time?** Follow the ordered runbook in [the main README](../README.md#deploying) - the Worker has to go first, because its hostname is compiled into the PWA's build-time CSP. This file is the reference for the Worker's own half: keys, config, verification, and the abuse surface.

## The provider chain

One request walks the chain in order and stops at the first provider that produces output:

| Order | Service | Endpoint | Default model |
|---|---|---|---|
| 1 | Ollama Cloud | `https://ollama.com/v1/chat/completions` | `gpt-oss:120b` |
| 2 | Hugging Face Router | `https://router.huggingface.co/v1/chat/completions` | `meta-llama/Llama-3.3-70B-Instruct` |
| 3 | NVIDIA NIM | `https://integrate.api.nvidia.com/v1/chat/completions` | `meta/llama-3.3-70b-instruct` |

All three speak the OpenAI chat-completions shape, so there is one adapter and a provider is just a URL, a model and a key.

**A provider with no key is skipped, not attempted.** "Out of quota" and "not configured" are different states and only one of them costs a round trip. Any non-2xx moves to the next provider: `429` is the exhausted quota this chain is built for, `401`/`403` is a dead key, `5xx` is an upstream fault, and all three mean the same thing to the caller.

**When the chain is exhausted the Worker answers with the reason, not a blanket `502`.** The PWA reads any non-2xx as a failed provider and falls through to its own two keyless endpoints, which are the fourth and last tier - so nobody sees an error until all five have failed. But the status still matters, because it is what the PWA turns into a sentence:

| Status | Meaning | Sent when |
|---|---|---|
| `401` | Credentials rejected | Every provider answered 401/403 |
| `402` | Credit or allowance spent | **Any** provider answered 402 |
| `429` | Rate limited | Every provider answered 429 |
| `504` | Nothing answered | Every provider timed out or failed to connect |
| `502` | Mixed or unclassified | Anything else |
| `503` | Nothing configured | No provider has a key |

A class is only reported when every provider agrees, because "all three keys are dead" and "one key is dead" need different words. Credit exhaustion is the exception: it is the most actionable failure and the one the reader can actually fix, so one provider reporting it is enough.

**The response body is never shown to a user.** It is an upstream's own text - a third party's string that could say anything - so the PWA reads only the status and writes its own sentence. The body exists for `curl` and for logs.

## Tool calling

Tools are offered to any provider whose model accepts them, and the loop runs here rather than in the browser: the PWA sends a conversation and receives text, and never learns that a tool ran.

- Up to three rounds per request. The last round never offers tools, so the loop cannot end on a call it has no round left to satisfy.
- A model that rejects a `tools` array (a `400`/`422` naming tools) is retried once **without** tools on the same provider, rather than burning a provider that still has quota. Set `OLLAMA_TOOLS`/`HUGGINGFACE_TOOLS`/`NVIDIA_TOOLS` to `"false"` to skip that round trip when you already know the model has no tool support.
- Fragments of a tool call arrive spread across many SSE chunks, keyed by index, and are reassembled in `src/deltas.ts`.

| Tool | Default | What it does |
|---|---|---|
| `get_current_time` | on | Current date and time in an IANA zone. |
| `fetch_url` | **off** | Fetches one public https page and returns its readable text, truncated to 8000 characters. |

`fetch_url` is off by default on purpose. A public proxy that fetches arbitrary URLs on request is an SSRF surface, not a feature. When `ENABLE_WEB_FETCH="true"` it still refuses non-https URLs, loopback, RFC 1918 ranges, link-local including the `169.254.169.254` metadata address, and the reserved private TLDs, and it caps the read and the wait. Enable it knowing what you are exposing.

`reasoning_content`, which NVIDIA and DeepSeek-family models return as a separate field, is re-emitted wrapped in `<think></think>`. That is the marker `src/components/thinking.ts` in the PWA already parses, so a reasoning trace from the online path renders in the same collapsible block as a local one.

## Before you start

- **A Cloudflare account.** The free Workers plan is enough - 100,000 requests a day, and the rate limiter below costs nothing extra.
- **Node 20 or newer**, for `wrangler`.
- **At least one provider key.** Not three. The chain skips any provider whose key is absent, so a Worker holding only an NVIDIA key works and simply starts there.

## Get the API keys

All three services have a free tier, and none of the three keys ever reaches the browser.

### Ollama Cloud - `OLLAMA_API_KEY`

1. Sign in at [ollama.com](https://ollama.com) and open [ollama.com/settings/keys](https://ollama.com/settings/keys).
2. Create a key and copy it.

Cloud models are listed at [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud). Use the plain name - `gpt-oss:120b`, not `gpt-oss:120b-cloud`; the `-cloud` suffix is for a local `ollama run` proxying upstream, not for this API.

### Hugging Face - `HUGGINGFACE_API_KEY`

1. Open [the token page pre-filled with the right permission](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained).
2. Create a **fine-grained** token with **Make calls to Inference Providers**. A plain read token is not enough.

The token begins `hf_`. The free tier carries a monthly credit; [PRO](https://hf.co/subscribe/pro) raises it.

Hugging Face routes to whichever partner serves the model, and the model id takes an optional policy suffix: bare or `:fastest` picks the highest throughput, **`:cheapest` picks the lowest price per output token**, `:preferred` follows your order in [Inference Provider settings](https://hf.co/settings/inference-providers). On a proxy you are paying for, `HUGGINGFACE_MODEL = "meta-llama/Llama-3.3-70B-Instruct:cheapest"` is usually the right call.

### NVIDIA NIM - `NVIDIA_API_KEY`

1. Sign in at [build.nvidia.com](https://build.nvidia.com) with an NVIDIA developer account.
2. Profile menu > **API keys** > generate. Or open any model on the site and use its **Get API Key** button.

The key begins `nvapi-`. Free, with no card and no trial clock. Available models: `curl https://integrate.api.nvidia.com/v1/models`.

### Checked, not assumed

Every endpoint and default model id in this file was probed live while writing it:

| Check | Result |
|---|---|
| `POST https://ollama.com/v1/chat/completions` | `401` with an OpenAI-shaped error body - the route exists and is OpenAI-compatible |
| `POST https://router.huggingface.co/v1/chat/completions` | `401` - route exists |
| `POST https://integrate.api.nvidia.com/v1/chat/completions` | `403 Authorization failed` - route exists |
| `meta-llama/Llama-3.3-70B-Instruct` in HF's `/v1/models` | present |
| `meta/llama-3.3-70b-instruct` in NVIDIA's `/v1/models` | present |

Ollama's `gpt-oss:120b` could not be confirmed without a key; it is the name Ollama's own cloud documentation uses.

## Deploy with wrangler (recommended)

```bash
cd worker
npm install
npx wrangler login

npx wrangler secret put OLLAMA_API_KEY
npx wrangler secret put HUGGINGFACE_API_KEY
npx wrangler secret put NVIDIA_API_KEY

npx wrangler deploy
```

Keys are secrets, never `vars`. Models, tool flags, the CORS list and the size cap are plain `vars` in `wrangler.toml`. `send_metrics = false` is set there too, so a deploy from this directory does not quietly contradict the project's own "no telemetry" claim.

## Deploy from the dashboard instead

Everything here can be done in the Cloudflare dashboard, with **one real gap**: rate limiting.

1. **Bundle the code.** The dashboard editor takes a single file, and this is a seven-module TypeScript project, so it has to be bundled first:

   ```bash
   cd worker && npm install && npm run bundle
   ```

   That writes one self-contained ES module to `worker/dist/index.js` (about 21 KB). Paste its whole contents into the dashboard editor. Nothing else in `dist/` is needed.

2. **Create the Worker.** [dash.cloudflare.com](https://dash.cloudflare.com) > **Workers & Pages** > **Create** > **Start with Hello World** > **Deploy**. The name you give it becomes the subdomain.

3. **Paste the code.** On the Worker's page, **Edit code** - the Quick Edit browser editor. Select all of `worker.js`, replace it with the whole contents of `worker/dist/index.js`, then **Deploy**.

4. **Add the keys.** **Settings** > **Variables and Secrets** > **Add** > type **Secret** > variable name, value > **Deploy**. Repeat for each of `OLLAMA_API_KEY`, `HUGGINGFACE_API_KEY`, `NVIDIA_API_KEY` that you have. Secret values are hidden afterwards in both the dashboard and wrangler; a plaintext variable would not be, which is the whole reason keys go in as Secret and never as Text.

5. **Add vars only to change a default.** Same screen, type **Text**, for anything in the config table below. Every one is optional: the code falls back to the values in that table, so a Worker with nothing but the secrets set works.

6. **Note the hostname** on the Worker's overview, then verify (see below).

**The gap: rate limiting is wrangler-only.** Cloudflare does not expose rate limiting bindings in the dashboard, so a Worker deployed this way has no `RATE_LIMITER` binding. The code treats it as optional and runs without throttling, which leaves only `MAX_PROMPT_CHARS` and the 64-message ceiling as brakes on a keyed proxy that costs money per request. Three ways out, in order of preference:

- Deploy once with `npx wrangler deploy` to get the binding, and use the dashboard for everything after that. Secrets, vars and code edits all keep working from the dashboard afterwards.
- Put the Worker on a custom domain in a zone you control and add a WAF rate limiting rule, which *is* a dashboard feature. This does not work on a `*.workers.dev` subdomain.
- Accept it, and keep `ALLOWED_ORIGINS` narrowed to your own site so a casual copy of the URL is not enough to spend your quota. Note this is a speed bump, not a control: `Origin` is trivially forged outside a browser.

## Verify the deploy

```bash
# Which providers came up configured. Never prints a key.
curl https://<your-worker>.workers.dev/health

# A real answer, streamed.
curl -N -X POST https://<your-worker>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hello in five words."}]}' -D -
```

`X-Gguf-Provider` and `X-Gguf-Model` in the response headers name who actually answered - the fastest way to see whether Ollama took it or the chain had already moved on. A `502` means every configured provider refused; the body says which one failed last.

**A configured provider being skipped is invisible from the chat path, on purpose** - a user waiting on a reply should not see four failures scroll past. When you are the operator and need the reason, ask for it:

```bash
curl 'https://<your-worker>.workers.dev/health?probe=1'
```

That sends each provider a one-token request and reports the real status and error body:

```json
{"probe":[
  {"id":"ollama","model":"gpt-oss:120b","status":401,"ok":false,"ms":230,"detail":"{\"error\":{\"message\":\"Unauthorized\"}}"},
  {"id":"huggingface","model":"meta-llama/Llama-3.3-70B-Instruct","status":200,"ok":true,"ms":940,"detail":""}
]}
```

`ms` is the point of the field: a provider that answers in 45 seconds and one that never answers are the same bare timeout, and only the first is worth waiting for.

It spends real quota, so it is rate limited like a chat request and never runs unless `probe` is present. Plain `/health` stays free and answers from config alone. Neither form prints a key.

To watch the fallback happen, remove one key with `npx wrangler secret delete OLLAMA_API_KEY` and repeat: the same request should come back with `X-Gguf-Provider: huggingface`.

## Troubleshooting

Run `?probe=1` first. It names the provider and gives you the upstream's own status and error, which is the whole diagnosis in one line.

### `401 Unauthorized` from Ollama

The key, not the model. A wrong model name comes back `404`.

Check the key outside this Worker before touching anything here:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ollama.com/v1/chat/completions \
  -H "Authorization: Bearer $OLLAMA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"gpt-oss:120b","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'
```

`401` there too means the key is the problem, and redeploying will not help. Common causes, in order:

- **The wrong kind of key.** [ollama.com/settings/keys](https://ollama.com/settings/keys) has held both an Ed25519 public key used by `ollama signin` for pushing and pulling, and API keys for HTTP calls. Only the second authenticates this endpoint.
- **The key is not registered to the account** that owns the cloud subscription.
- **Cloud access is not on that account.** The endpoint exists for everyone and answers `401` regardless, so this looks identical to a bad key from outside.

Whitespace is already handled - `resolveProviders()` trims the secret, so a trailing newline from a paste cannot cause this.

`200` from that curl but `401` through the Worker means the secret was stored wrong. Re-run `npx wrangler secret put OLLAMA_API_KEY`, or delete and re-add it in the dashboard.

### A provider times out

The chat path gives an upstream 60s, the probe 45s. Read `ms` before concluding anything.

**Cold start, not death.** NVIDIA NIM in particular queues a request while the model spins up, and a first call after a quiet period can take tens of seconds while a rejected one comes back in under a second. Confirm the difference from outside:

```bash
curl -s -o /dev/null -w 'HTTP %{http_code} in %{time_total}s\n' -X POST \
  https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"meta/llama-3.3-70b-instruct","messages":[{"role":"user","content":"ping"}],"stream":true,"max_tokens":1}'
```

A bad key returns `403` in well under a second, so a long wait means the request was accepted and is queued, not refused.

**A provider that reliably exceeds the timeout costs every request that reaches it.** Position matters: the chain only stalls if the slow provider sits ahead of a working one. A slow provider last in the chain is nearly free, because it is only reached when everything before it has already failed. If it is genuinely dead, remove it with `npx wrangler secret delete <KEY>` so the chain skips it instead of waiting on it.

### Everything answers `502`

Every configured provider refused. The body names the last failure; `?probe=1` names all of them.

### The PWA cannot reach a working Worker

Almost always the CSP. `grep -o "connect-src[^;]*" dist/index.html` must contain your hostname. If it does not, `REMOTE_WORKER_HOST` was changed without a rebuild - the CSP is a build-time `<meta>` tag, so a running site cannot pick up a new host.

## Wiring it into the PWA

Either way, wire the deployed hostname into the PWA, then rebuild and republish it - steps 4 to 7 of [the main runbook](../README.md#deploying). This needs **two** edits in the same commit or the build fails on purpose:

1. `REMOTE_WORKER_HOST` in [`../src/types/remote.ts`](../src/types/remote.ts) - that one line reaches the CSP in `index.html`, the CORP re-serve in `src/sw.ts`, and the endpoint validation in Settings. Setting it to a real hostname also flips the provider from inactive to enabled.
2. The matching token in [`../scripts/check-no-telemetry.sh`](../scripts/check-no-telemetry.sh).

The repository currently points at `gguf-proxy.feeds-pwa.workers.dev`. To run the PWA with no proxy at all, set `REMOTE_WORKER_HOST` to any `.invalid` host - the RFC 2606 TLD that can never resolve - and the provider ships disabled, so no request is aimed at it.

## Config

| Var | Default | Notes |
|---|---|---|
| `OLLAMA_MODEL`, `HUGGINGFACE_MODEL`, `NVIDIA_MODEL` | see table above | Any chat model on that service. |
| `OLLAMA_TOOLS`, `HUGGINGFACE_TOOLS`, `NVIDIA_TOOLS` | `"true"` | `"false"` skips the tools round trip for that provider. |
| `ALLOWED_ORIGINS` | `"*"` | Comma-separated origin list, or `*`. The PWA is a public static site, so open is the default. |
| `ENABLE_WEB_FETCH` | `"false"` | Arms the `fetch_url` tool. |
| `MAX_PROMPT_CHARS` | `"24000"` | Rejected with `400` before any upstream request is made. |

## Abuse surface

This is the first piece of the project that costs money per request, so throttling is in the request path rather than on a list of follow-ups:

- **Rate limit.** Workers' built-in rate limiter, keyed on `CF-Connecting-IP`, 20 requests per 60 seconds. No KV namespace and no Durable Object, so it adds no cost of its own. The binding is optional in code: without it the Worker still runs, it just does not throttle.
- **Size cap.** `MAX_PROMPT_CHARS` and a 64-message ceiling, both checked before an upstream is called.
- **Bounded work.** Three tool rounds, at most two requests per round, a 60s upstream timeout, a 512 KB SSE line cap, and an 8000-character cap on tool output.

Every upstream body is third-party JSON and is narrowed field by field before use. Nothing from an upstream reaches the response except text.

## API

| | |
|---|---|
| `POST /` | `{"messages":[{"role":"user","content":"…"}]}` - what the PWA sends. Roles are `system`, `user`, `assistant`. |
| `POST /` | `{"prompt":"…"}` - the flattened single-string shape, also accepted. |
| `GET /?prompt=…` | The same thing for a manual `curl`. Subject to the URL length ceiling, which is why the PWA does not use it. |
| `GET /health` | Which providers are configured, and whether `fetch_url` is armed. Free, and never includes a key. |
| `GET /health?probe=1` | The same, plus a live one-token call to each provider with its real status and error. Costs quota; rate limited. |

The reply is `text/plain; charset=utf-8`, streamed. `X-Gguf-Provider` and `X-Gguf-Model` name who answered.

**A provider is only committed to once it has produced real output.** Everything before the first token - connecting, a bad status, an empty stream, a tools rejection - falls through silently. After the first token the reply belongs to that provider, and a later failure ends the stream as an error rather than restarting somewhere else: half a reply from one model followed by half from another is worse than a visible failure. This is the same discipline `src/engine/remote.ts` applies on the client.

## Checks

```bash
cd worker && npx tsc --noEmit     # typecheck against @cloudflare/workers-types
npm test                          # from the repo root - worker/src/*.test.ts run with the app's suite
npm run lint                      # from the repo root - covers worker/src/
```

The pure logic here - provider order, SSE framing, delta and tool-call reassembly, request validation, the SSRF host list - is unit-tested in the app's own Vitest run. Nothing in those tests touches a real upstream.
