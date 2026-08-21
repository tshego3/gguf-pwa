/// <reference lib="webworker" />

// src/sw.ts carries dual duty in this project, and is the one file
// exempted from the no-comments rule because none of this is obvious:
//
// 1. Workbox precaching of the app shell and the vendored WASM runtime.
//    Model weights are never part of this manifest - they live in OPFS via
//    wllama's cache manager, and precaching them would double the on-device
//    storage cost.
// 2. COOP/COEP synthesis on same-origin navigations, so a browser that
//    never got isolation headers from GitHub Pages (which cannot set
//    response headers at all) gets them from here instead, unlocking
//    multi-thread WASM (Tier B). This only takes effect after the SW
//    controls the page, so the first visit is never isolated - the app
//    offers a reload as an explicit action rather than doing it silently.
// 3. CORP injection on cross-origin model responses (Hugging Face and its
//    CDN), so `credentialless` COEP does not break the fetches that
//    ModelManager makes once isolation is active.
// 4. Explicit update flow: no silent skipWaiting(). A new SW build sits in
//    "waiting" until a client asks for it, so the app can show an update
//    prompt rather than swapping inference code out from under a live tab.

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// __SW_VERSION__ is injected at build time (vite.config.ts define) from the
// package version plus a build timestamp, so "the engine version in
// Settings always matches the running SW build" (P5-T2) is a build
// guarantee, not something that can drift.
declare const __SW_VERSION__: string;

const MODEL_HOST_PATTERN = /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)$/i;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  // No skipWaiting() here - see the update-flow note above.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: __SW_VERSION__ });
  }
});

function withIsolationHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withCorpHeader(response: Response): Response {
  if (response.headers.has('Cross-Origin-Resource-Policy')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigation fallback: serve the precached shell offline, with isolation
  // headers synthesized so crossOriginIsolated can become true on the next
  // load. Falls back to the cached index.html when fully offline, so the
  // hash router can take over client-side for any deep link.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(withIsolationHeaders)
        .catch(async () => {
          const cached = await caches.match('/gguf-pwa/index.html');
          return cached ? withIsolationHeaders(cached) : Response.error();
        }),
    );
    return;
  }

  // Cross-origin model traffic: re-serve with CORP so it survives
  // require-corp-adjacent restrictions once this page is isolated. Passes
  // the Hugging Face 302 redirect to its CDN through untouched other than
  // the header addition, and preserves Range requests for resume.
  if (url.origin !== self.location.origin && MODEL_HOST_PATTERN.test(url.origin)) {
    event.respondWith(fetch(request).then(withCorpHeader));
  }
});
