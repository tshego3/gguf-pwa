---
name: gguf-pwa-engineering
description: Core engineering rules for gguf-pwa (TypeScript + Vite + Mantine + WebAssembly PWA running llama.cpp GGUF models on-device). Use before ANY feature work, bug fix, or refactor in this repository - covers architecture boundaries, the worker/engine split, project structure, TypeScript strictness, change management, build/tooling, and GitHub Pages deployment.
---

# Engineering Rules (TypeScript + Vite + Mantine + WebAssembly PWA)

These rules are mandatory for all feature work, bug fixes, and refactors.

## Platform Identity

1. Stack is TypeScript + React + Vite (pure client-side PWA - no SSR, no framework router, no server runtime).
2. UI library is [Mantine](https://mantine.dev/) (Core, Hooks).
3. This is **gguf-pwa** - a browser-local LLM client. It downloads or opens a quantized llama.cpp GGUF model and runs inference entirely on the user's device via `@wllama/wllama`.
4. **No inference server, no API key, no telemetry.** After the weights land, no request leaves the browser. This is the product's central claim; a change that breaks it is a change to the product, not an implementation detail.
   - One recorded exception, off by default: the optional online API (`src/engine/remote.ts`). Selecting it in the model switcher sends prompts off the device, which the UI states before the switch. It is never the default and never on the local path.
   - **No API key is ever in the bundle**, and that part has no exception. A public static site cannot hold a secret. The keyed providers are reached through `worker/`, which holds the keys in Cloudflare secrets on its own side.
5. Deployment target is GitHub Pages. PWA features via Workbox Service Worker.
6. Targets are iOS, Windows, and Android, all first-class. The iOS floor is "anything running iOS 26" - iPhone SE 2nd gen and iPhone 11 upward.

## Non-Negotiable Architecture Rules

1. **The PWA is fully static** - no Express, no Node server, no SSR runtime. It builds to `dist/` and is served by GitHub Pages. If a problem seems to need a server, re-read the plan: the service worker is the proxy. Model downloads in particular need none.
   - **One Cloudflare Worker exists, in `worker/`, and it is the only one that ever will.** It is a keyed inference proxy for the optional online API, nothing else. It holds no app state, serves no page, and is not part of the static build or its deploy. The app runs completely without it: point `REMOTE_WORKER_HOST` at a `.invalid` host and its provider ships disabled, with the online path falling through to keyless endpoints.
   - The bar for a second one is the bar this one cleared: it must be impossible in the browser (here, holding a secret), opt-in, off the critical path, and harmless when absent.
2. **No remote database and no remote inference.** All state is local. Model weights never leave the device and never arrive from anywhere but the user's disk or the model host.
3. No authentication flows. There is no account.
4. **Inference never runs on the main thread.** wllama is hosted in a Web Worker. A blocking call on the render thread is a bug, not a tradeoff.
5. **`src/engine/` is the only module that imports `@wllama/wllama`.** Everything else talks to the engine through its typed interface, so the engine stays swappable.
6. Keep modules small and focused - one concern per file.
7. Shared types and interfaces live in `src/types/`. Never create model types outside it; no inline duplication.
8. Routing is a client-side hash router. No framework router libraries.

## Architecture Layers

```
Components (React/Mantine) --reads--> Hooks/State --calls--> Services (src/engine/, src/models/, src/db/) --uses--> Types (src/types/)
```

| Layer | Responsibility | Location |
|-------|---------------|----------|
| Types | Pure interfaces, zero runtime deps | `src/types/` |
| Services (Engine) | Worker-hosted wllama. Load, unload, stream, abort, count tokens, report tier | `src/engine/` |
| Services (Models) | Catalog, the three acquisition paths, OPFS accounting, eviction recovery | `src/models/` |
| Services (DB) | IndexedDB CRUD via `idb`. Conversations, settings, file handles | `src/db/` |
| Theme | Centralized Mantine theme override (Monolithic Clarity) | `src/theme/` |
| Components | Presentational, receive data via props, no direct service calls | `src/components/` |
| Screens | Page-level composition, orchestrate services via hooks | `src/screens/` |
| Service Worker | Workbox precaching + COOP/COEP synthesis + CORP injection | `src/sw.ts` |

**Golden rule:** Components never call services directly. Screens orchestrate data flow via hooks or service functions.

**Second golden rule:** No layer above `src/engine/` knows that wllama exists.

## Backend Tiers

The engine selects one of three tiers at load time and reports it. The active tier is always visible to the user, because it explains the speed they get.

| Tier | Backend | Requires | Notes |
|------|---------|----------|-------|
| A | WebGPU | Nothing. No cross-origin isolation needed. | Available on every supported iOS device (Safari 26), Windows Chrome/Edge/Firefox, Android Chrome. The default path. |
| B | WASM SIMD multi-thread | `crossOriginIsolated`, synthesized by `src/sw.ts` | Upgrade path for devices without WebGPU. Needs a reload after the SW takes control. |
| C | WASM SIMD single-thread | Nothing | Always available, several times slower. Steer these users to a smaller model. |

Tier A makes Tier B optional. Never put Tier B on the critical path.

## Project Structure

1. Entry point is `index.html` at root; app entry is `src/main.tsx` with MantineProvider and SW registration.
2. Vite config at root with `base: '/gguf-pwa/'` for GitHub Pages.
3. Static assets in `public/` (manifest.webmanifest, favicon.svg, `models.json` catalog). No `src/assets/` for runtime data.
4. **wllama WASM binaries are vendored into the build**, never fetched from a CDN. A CDN fetch is a third-party runtime dependency, it complicates the CSP, and it breaks offline start.
5. `src/theme/` is the single source of design tokens.
6. Playwright specs in `e2e/`. The sub-1MB test GGUF fixture is committed at `e2e/fixtures/`.

## TypeScript Rules

1. `strict: true` - no exceptions. Treat all compiler and linter warnings as errors.
2. Strictly **no `any` types**. Explicit interfaces and types for all components, props, and data models.
3. Never use `@ts-ignore` or `@ts-expect-error` without a comment explaining why.
4. `interface` for object shapes; `type` for unions, intersections, computed types.
5. Prefer `const` over `let`; never `var`. Template literals over concatenation. `readonly` where mutation is not required.
6. Functional TypeScript with module pattern. No class-based patterns unless justified.
7. No non-null assertions (`!`) in production code - use optional chaining, nullish coalescing, or explicit checks.

## Robust Coding Principles

1. Simple control flow - avoid complex recursion; all loops must have a deterministic upper bound.
2. Functions <=40 lines; extract sub-functions if longer.
3. Guard clauses: validate inputs at the top, exit early on invalid state.
4. Module-private (unexported) functions by default; expose only the public API.
5. Never ignore a Promise - always `await` or explicitly `.catch()`.
6. Immutability first: `readonly` properties, new objects over mutation.
7. No global mutable state - no module-level `let` for shared state; use React state, context, or service modules.

## Memory Discipline

Memory is the binding constraint on this project, not CPU. These are engineering rules, not optimizations.

1. **Never materialize a whole model in an `ArrayBuffer`.** Stream from OPFS or pass `Blob`/`File` objects straight to `loadModel`. A single 1 GB `ArrayBuffer` is the most likely cause of an iOS tab kill.
2. **One model resident at a time.** Loading a second unloads the first, explicitly and visibly.
3. Split GGUFs above 512 MB and load chunks sequentially.
4. Treat `n_ctx` as a memory setting, not a quality setting. KV cache runs roughly 32 KB per token on a 1B model, so 8192 tokens costs ~256 MB. Show the cost in MB wherever the user can change it.
5. Detect the device RAM tier and default the model size accordingly. Warn, never block.
6. A tab kill produces no catchable error. Design so the app recovers on next launch rather than trying to handle it.

## Production Stability

1. Context-rich errors - never `throw new Error('failed')`. Use typed error objects: `throw { type: 'oom', message: 'Model too large for this device' }`.
2. No empty catch blocks - at minimum, log why it is safe to ignore.
3. Timeouts on all network calls via `AbortController` - never let a request hang. Model downloads are the exception to the timeout, not to the abort.
4. Keep business logic in pure functions separate from I/O.
5. User-safe error messages - never expose raw errors, stack traces, file paths, or raw wllama output.

## Change Management

1. Prefer minimal, scoped changes over broad rewrites. Do not refactor unrelated areas.
2. Keep naming, formatting, and style aligned with surrounding code.
3. Code must pass ESLint with zero errors before merge.
4. No nested ternaries or deeply nested conditionals - prefer early returns and flat logic. Prefer ternary, nullish coalescing (`??`), optional chaining (`?.`).
5. Direct, descriptive naming. Apply DRY - reuse existing utilities before creating parallel implementations.
6. If code cannot be understood quickly without comments, simplify it first. `src/sw.ts` is the documented exception: its header-synthesis logic is the least obvious code in the repo and must carry comments explaining why.
7. Clean code. No em dashes or emojis in comments.
8. Replace any hardcoded mock/placeholder data before completion.
9. **Code is liability, not an asset.** Every line must justify its existence. Pursue the smallest diff; prefer deleting or simplifying over adding.
10. Compliance pass before finalizing: verify alignment with these project skills, and audit dependencies/security - (a) packages from legitimate publishers, (b) no unmaintained deps (last commit > 12 months), (c) no known CVEs, (d) no hardcoded secrets, (e) all network calls use HTTPS + validation, (f) error messages leak no internals.

## Build and Tooling

1. Use `npm` only; commit `package-lock.json`.
2. All dependency versions pinned exactly (no `^`/`~`) - `.npmrc` has `save-exact=true`.
3. Justify every new dependency; prefer lightweight, single-purpose, MIT/Apache-licensed packages. Vet before adoption: verify on npmjs.com, legitimate publisher, no CVEs, active maintenance. Do not trust AI-suggested package names blindly.
4. Core deps: `@wllama/wllama`, `@mantine/core`, `@mantine/hooks`, `@tabler/icons-react`, `idb`, `workbox-precaching`, `marked`, `dompurify`.
5. Dev deps: `vite`, `vite-plugin-pwa`, `typescript`, `eslint`, `typescript-eslint`, `vitest`, `@playwright/test`, `@axe-core/playwright`.
6. Run `npm run build` after changes to verify zero TypeScript errors; `vite preview` to verify the production build.
7. Audit the bundle with `npx vite-bundle-visualizer` before major deploys. Confirm the WASM binaries are served rather than inlined, and that unused wllama variants are dropped.

## Deployment (GitHub Pages)

1. `base: '/gguf-pwa/'` in `vite.config.ts`; build to `dist/`; deploy via GitHub Actions to the `gh-pages` branch.
2. GitHub Pages cannot set response headers. CSP is delivered by meta tag; COOP/COEP are synthesized by `src/sw.ts`. Do not add a build step that pretends otherwise.
3. Verify the PWA install prompt on the deployed HTTPS URL. No source maps in production.
4. Cross-origin isolation only takes effect after the service worker controls the page, so the first visit is never isolated. Handle this in the UI, not by hiding it.

## Adding a New Feature (Checklist)

1. **Types** - interfaces in `src/types/` with `readonly` properties
2. **Services** - async functions in `src/engine/`, `src/models/`, or `src/db/` - pure I/O with typed errors
3. **State** - hook or state module with loading/error/data flow
4. **Components** - Mantine-based, props-driven, 4-branch rendering
5. **Screens** - compose components, wire services at screen level
6. **Tests** - Vitest for pure logic, Playwright for the flow
7. **Devices** - if it touches memory, storage, or the backend tier, test on a real phone. CI cannot answer those questions.
8. **Build** - `npm run build` with zero errors
