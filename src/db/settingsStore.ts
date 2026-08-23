import { getDb } from './schema';
import { DEFAULT_SETTINGS, mergeRemoteProviders, type AppSettings } from '../types';

const SETTINGS_KEY = 'app-settings';

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...(stored as Partial<AppSettings>) };
  // A stored provider list is a snapshot of the build that wrote it, so a
  // plain spread would pin an existing install to the providers that
  // existed then - a new primary endpoint would never reach anyone who has
  // opened the app before. Only the editable fields come from storage.
  return { ...merged, remoteProviders: mergeRemoteProviders(merged.remoteProviders) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings, SETTINGS_KEY);
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...patch };
  await saveSettings(next);
  return next;
}
