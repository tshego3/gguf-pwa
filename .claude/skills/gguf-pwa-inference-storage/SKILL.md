---
name: gguf-pwa-inference-storage
description: Inference engine, model acquisition, storage, PWA, and client-side security rules for gguf-pwa. Use when touching the wllama engine wrapper (src/engine/), model download or local-file loading (src/models/), OPFS or IndexedDB storage, the GGUF catalog, the service worker (src/sw.ts), cross-origin isolation, the manifest, offline caching, or anything security-sensitive (XSS, sanitization, CSP, dependencies, untrusted model output).
---

# Inference, Model Acquisition, Storage, PWA, and Security Rules

## Storage Layers

Three stores, deliberately separate. Putting weights in the wrong one is how a tab gets killed.

| Store | Holds | Owner |
|-------|-------|-------|
| **OPFS** | Model weights (GGUF blobs and splits) | wllama's cache manager, which defaults to OPFS |
| **IndexedDB** (`gguf-db`) | Conversations, messages, settings, install records, persisted `FileSystemFileHandle` objects | `src/db/` |
| **Cache API** | App shell and vendored WASM binaries | Workbox, via `src/sw.ts` |

1. **Never put model weights in IndexedDB.** Hundreds of megabytes inside a database transaction is a reliable way to get a tab killed on iOS.
2. Use the `idb` wrapper for all IndexedDB operations - no raw IndexedDB API.
3. All IndexedDB CRUD lives in `src/db/` - no database operations in component or screen files.
4. Object stores: `conversations` (key `id`), `messages` (key `[conversationId, seq]`), `settings` (key-value), `installedModels` (key `modelId`, includes source and any file handle).
5. Request `navigator.storage.persist()` at first install and surface the outcome in Settings. Without it, a gigabyte can be evicted silently.
6. **Eviction is a normal state, not an error.** A missing model at startup resolves to a re-acquire prompt with the model preselected, never an error screen.

### Core Models (src/types/)

```typescript
type BackendTier = 'webgpu' | 'wasm-mt' | 'wasm-st';

type ModelSource = 'catalog' | 'local-file' | 'local-handle';

interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly repo: string;              // Hugging Face repo id
  readonly files: readonly string[];  // one entry, or many for a split GGUF
  readonly params: string;            // '0.6B'
  readonly quant: string;             // 'Q4_K_M'
  readonly bytes: number;             // verified with a HEAD request, never estimated
  readonly contextLength: number;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly minDeviceMemoryGb: number; // gates the recommendation, never blocks
}

interface InstalledModel {
  readonly modelId: string;
  readonly source: ModelSource;
  readonly bytes: number;
  readonly installedAt: number;
  readonly handleKey?: string;        // IndexedDB key of a FileSystemFileHandle
}

interface ChatMessage {
  readonly conversationId: string;
  readonly seq: number;
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
  readonly partial: boolean;          // true when generation was aborted
  readonly createdAt: number;
}

interface EngineCapabilities {
  readonly tier: BackendTier;
  readonly webgpu: boolean;
  readonly crossOriginIsolated: boolean;
  readonly fileSystemAccess: boolean;
  readonly opfs: boolean;
  readonly deviceMemoryGb: number | null;
  readonly hardwareConcurrency: number;
  readonly maxBufferSize: number | null;
}

type EngineError =
  | { type: 'unsupported'; message: string }
  | { type: 'download'; message: string; status?: number }
  | { type: 'load'; message: string }
  | { type: 'oom'; message: string }
  | { type: 'inference'; message: string }
  | { type: 'aborted'; message: string };
```

## Model Acquisition (src/models/)

Two paths, offered as equal peers in the UI. Neither is a fallback.

### Path 1 - Load from this device (primary)

1. `wllama.loadModel()` accepts `Blob[]`, so a `File` from a picker loads with no adaptation.
2. **Windows and Android Chrome/Edge**: use `showOpenFilePicker()`, persist the `FileSystemFileHandle` in IndexedDB, and re-acquire on startup with `queryPermission()` then `requestPermission()`. The file stays where the user put it. Nothing is copied. Zero duplicate storage.
3. **iOS Safari and Firefox**: no File System Access API. Use `<input type="file" accept=".gguf" multiple>` and stream-copy into OPFS, because a `File` object does not survive a reload. Show the storage cost before the copy starts and prompt the user to delete the original afterwards.
4. Accept multiple files for split GGUFs.
5. **Validate the GGUF magic bytes and header before accepting.** A wrong file must fail immediately with a clear message, never inside the engine.

### Path 2 - Download from the catalog (secondary)

1. Catalog is static at `public/models.json`, typed as `CatalogModel[]`.
2. **Every `bytes` value is verified with a `HEAD` request before it enters the catalog.** Never copy a published estimate.
3. Use wllama's `ModelManager` for downloads: `parallelDownloads`, `allowOffline`, and progress callbacks are provided.
4. Progress reported by byte. Cancel via `AbortController`. Resume after a killed tab rather than restarting.
5. Pre-flight before the first byte: size against `navigator.storage.estimate()`, `navigator.connection` for cellular and save-data, size against the device RAM tier.
6. **An explicit consent step naming the exact download size and the model licence.** A gigabyte on someone's mobile data is not a background task.
7. Hugging Face serves `resolve/` URLs with `Access-Control-Allow-Origin: *`, so no CORS proxy is needed. Do not add one.
8. Fetch from the original repository. Never mirror or rehost weights - it raises a licence question that direct fetching avoids.

## Inference Engine (src/engine/)

1. **`src/engine/` is the only module that imports `@wllama/wllama`.**
2. wllama runs in a Web Worker. The main thread never blocks on a token.
3. Public API, and nothing else exported: `loadModel`, `unloadModel`, `chat` (returns an async stream), `abort`, `countTokens`, `capabilities`.
4. Tier selection is automatic with a manual override in Settings. Probe WebGPU first; it needs no cross-origin isolation. Fall back to multi-thread WASM if `crossOriginIsolated`, then single-thread.
5. Probe `maxBufferSize` and `maxStorageBufferBindingSize` before committing to WebGPU. Mobile GPUs may reject a large model; reduce `n_gpu_layers` and fall back to hybrid CPU/GPU rather than failing.
6. Firefox needs wllama's WebGPU compatibility mode, which the project documents as significantly slower. Default Firefox to WASM and let the user opt in.
7. Quantization: prefer Q4, Q5, or Q6. **Avoid IQ quants** - wllama reports them as slow and low quality in this runtime.
8. Split models above 512 MB. This speeds the download and sidesteps the 2 GB `ArrayBuffer` ceiling.
9. Generation params are validated inputs: `n_ctx`, temperature, top-k, top-p, max tokens, seed, system prompt. `n_ctx` defaults per device tier, with the KV cache cost shown in MB.
10. Every failure maps to one `EngineError` and one user-safe sentence. Raw wllama output never reaches the UI.

## PWA Rules

1. Once a model is installed, the app must cold-start and hold a full conversation with the network disabled. This is the product's main promise.
2. `src/sw.ts` has **dual duty**, and this is the least obvious code in the repo:
   - **Workbox precaching** of the app shell and the vendored WASM binaries. **Never precache weights** - they already live in OPFS, and precaching would double the storage.
   - **COOP/COEP synthesis**: re-serve same-origin navigations with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` to unlock Tier B. This is what `coi-serviceworker` does, written into the SW you already ship, so there is no second service worker and no scope collision.
   - **CORP injection**: re-serve cross-origin model responses with `Cross-Origin-Resource-Policy: cross-origin` so downloads keep working once isolation is on.
3. Isolation only takes effect after the SW controls the page. The first visit is never isolated and needs a reload. Explain this in the UI rather than reloading silently.
4. Handle the Hugging Face 302 redirect to its CDN, and preserve `Range` requests through the SW, or resume breaks.
5. **The SW version and the WASM version move together.** A stale SW pins users to old inference code while they run new UI. Prompt on update and show the engine version in Settings.
6. Distinguish "offline" from "no model installed" in the UI. They look identical to a user and are not the same problem.
7. Manifest (`public/manifest.webmanifest`): SVG icon (any + maskable), `display: standalone`, `theme_color: #131313`.
8. Show a subtle offline indicator banner when the device is offline.
9. If Tier B proves troublesome on a browser, **ship without it there.** Tier A already covers the supported iOS fleet.

## Security Rules (Client-Side)

1. **Model output is untrusted input.** Sanitize before rendering. Render assistant markdown with `marked` then `dompurify` - `dompurify` is not optional. Prefer `textContent` over `innerHTML` everywhere else.
2. **CSP carve-out for WASM.** WASM instantiation requires `wasm-unsafe-eval` in `script-src`. The ban on JavaScript `eval()`, `Function()`, and `document.write()` still stands. Delivered by meta tag, since GitHub Pages cannot set headers.
3. `connect-src` is limited to the weight host. There is no analytics endpoint and no API.
4. Never store secrets, API keys, or credentials in source code or localStorage. There are none in this app; keep it that way.
5. Validate all external input before use: GGUF headers, catalog JSON, URL strings, and anything read back from storage.
6. `rel="noopener noreferrer"` on all external links with `target="_blank"` - licence links in particular.
7. Vet all dependencies before adoption: exists on npmjs.com, legitimate publisher, no CVEs, active maintenance, clear MIT/Apache license. Never trust AI-suggested package names blindly - they may be typosquatted.
8. Error messages must not leak internals (stack traces, raw errors, file paths, raw engine output).
9. Every catalog model shows its licence and a working licence link **before** download. On the local-file path the licence question belongs to the user, who obtained the file themselves.
