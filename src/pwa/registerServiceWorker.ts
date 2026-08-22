// Thin wrapper around the raw Service Worker API. Kept out of src/hooks/ on
// purpose - this needs to run once at the module level (registration must
// happen before React mounts finish, and must survive independent of any
// one component's lifecycle), whereas hooks are per-render by design.

export interface SwUpdateHandlers {
  readonly onUpdateAvailable: () => void;
}

let registration: ServiceWorkerRegistration | null = null;
// Set only inside applyWaitingServiceWorker() - the very first time a SW
// takes control of a page also fires 'controllerchange', and reloading
// then would be an unexplained, unrequested reload on first visit.
let userRequestedUpdate = false;

export async function registerServiceWorker(handlers: SwUpdateHandlers): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    // register() is typed as always resolving to a registration, but the
    // runtime contract is weaker than the type: an environment that blocks
    // or stubs service workers (Playwright's serviceWorkers: 'block', an
    // enterprise policy, a privacy extension) resolves it with undefined
    // rather than rejecting. Reading .waiting off that threw
    // "TypeError: can't access property 'waiting'" before the guard below,
    // which is why the cast is deliberate rather than an oversight.
    const result = (await navigator.serviceWorker.register('/gguf-pwa/sw.js')) as
      | ServiceWorkerRegistration
      | undefined;
    if (!result) return;
    registration = result;
  } catch (error) {
    console.warn('Service worker registration failed', error);
    return;
  }

  if (registration.waiting && registration.active) {
    handlers.onUpdateAvailable();
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration?.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        handlers.onUpdateAvailable();
      }
    });
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A controller change also fires the first time a SW ever takes
    // control of a freshly-loaded page - only reload when it was this
    // session's own explicit update request, never on that first control
    // (P5-T3: no silent reload).
    if (!userRequestedUpdate || hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}

// Explicit action only - called from the update prompt's "Reload" button,
// never automatically.
export function applyWaitingServiceWorker(): void {
  userRequestedUpdate = true;
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export async function getServiceWorkerVersion(): Promise<string | null> {
  if (!navigator.serviceWorker.controller) return null;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(null);
    }, 2000);

    function onMessage(event: MessageEvent<{ type: string; version: string }>): void {
      if (event.data?.type !== 'VERSION') return;
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(event.data.version);
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
  });
}
