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
