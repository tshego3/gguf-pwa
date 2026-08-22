import { loadSettings, patchSettings } from '../db';

// Requests persistent storage once, at first install, and remembers the
// outcome so it is not re-requested on every launch. Without this grant a
// browser under storage pressure can evict a gigabyte of model weights with
// no warning (P2-T10).
export async function ensurePersistentStorageRequested(): Promise<boolean> {
  const settings = await loadSettings();
  if (settings.persistentStorageGranted) return true;

  if (!navigator.storage?.persist) return false;

  const granted = await navigator.storage.persist();
  await patchSettings({ persistentStorageGranted: granted });
  return granted;
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
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;

  try {
    const granted = await navigator.storage.persist();
    await patchSettings({ persistentStorageGranted: granted });
    return granted;
  } catch {
    // A browser that refuses outright is reported as "not granted" rather
    // than as an error - the copy path still works without persistence,
    // it is just evictable.
    return false;
  }
}
