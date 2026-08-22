import { loadSettings, patchSettings } from '../db';

// Firefox answers navigator.storage.persist() with a permission doorhanger
// and leaves the promise pending until the user decides - forever if they
// ignore it. Measured: the call never settles on Firefox, while Chromium
// resolves it in about 4ms without prompting at all. Anything that awaits
// it therefore needs a bound, or an unanswered prompt silently blocks the
// caller. The local-file copy did exactly that - it sat on "Copying into
// on-device storage - 0%" with the copy never started, which is what broke
// every Firefox spec that installs the test fixture.
const PERSIST_DECISION_TIMEOUT_MS = 3_000;

// 'undecided' is a real, common answer, not an error: the browser is
// showing a prompt nobody has answered yet. It is kept distinct from
// 'denied' so callers can wait, proceed, or explain, rather than reporting
// a refusal that never happened.
export type PersistOutcome = 'granted' | 'denied' | 'undecided';

// Asks the browser, and gives up waiting after a bounded delay. The
// underlying request stays live either way, so a late answer is still
// recorded - it just no longer holds up whatever asked.
async function requestPersistDecision(): Promise<PersistOutcome> {
  if (!navigator.storage?.persist) return 'denied';

  const decision: Promise<PersistOutcome> = navigator.storage.persist().then(
    (granted): PersistOutcome => (granted ? 'granted' : 'denied'),
    // A browser that refuses outright is reported as "not granted" rather
    // than as an error - every path here works without persistence, the
    // copy is just evictable.
    (): PersistOutcome => 'denied',
  );

  void decision.then((outcome) => rememberOutcome(outcome));

  return Promise.race([
    decision,
    new Promise<PersistOutcome>((resolve) => {
      setTimeout(() => resolve('undecided'), PERSIST_DECISION_TIMEOUT_MS);
    }),
  ]);
}

async function rememberOutcome(outcome: PersistOutcome): Promise<void> {
  if (outcome === 'undecided') return;
  await patchSettings({ persistentStorageGranted: outcome === 'granted' }).catch(() => undefined);
}

// Requests persistent storage once, at first install, and remembers the
// outcome so it is not re-requested on every launch. Without this grant a
// browser under storage pressure can evict a gigabyte of model weights with
// no warning (P2-T10).
export async function ensurePersistentStorageRequested(): Promise<boolean> {
  const settings = await loadSettings();
  if (settings.persistentStorageGranted) return true;

  return (await requestPersistDecision()) === 'granted';
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

// Unlike ensurePersistentStorageRequested(), this ignores the remembered
// outcome and asks again. Chromium only grants persistence once a site
// clears an engagement bar, so a request that was declined at first launch
// can succeed later - and several browsers only prompt at all when the call
// carries a user gesture, which the automatic first-launch request does not
// have. Call this from a click handler, never from an effect.
export async function requestPersistentStorage(): Promise<PersistOutcome> {
  return requestPersistDecision();
}
