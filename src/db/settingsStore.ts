import { getDb } from './schema';
import { DEFAULT_SETTINGS, type AppSettings } from '../types';

const SETTINGS_KEY = 'app-settings';

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', SETTINGS_KEY);
  return stored ? { ...DEFAULT_SETTINGS, ...(stored as Partial<AppSettings>) } : DEFAULT_SETTINGS;
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
