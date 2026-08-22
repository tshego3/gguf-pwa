import { listInstalledModels, loadSettings, patchSettings } from '../db';
import { REMOTE_MODEL_ID, type InstalledModel } from '../types';

// What the active-model setting currently points at. The online API shares
// the id space with installed models so one switcher offers both, which
// means "which backend is active" has three answers, not two.
export type ActiveSelection =
  | { readonly kind: 'remote' }
  | { readonly kind: 'local'; readonly model: InstalledModel }
  | { readonly kind: 'none' };

// The model most recently installed becomes active by default; an explicit
// choice in settings overrides that. There is always at most one active
// model, matching the engine's single-residency rule.
export async function resolveActiveModel(): Promise<InstalledModel | null> {
  const [settings, installed] = await Promise.all([loadSettings(), listInstalledModels()]);
  if (settings.activeModelId === REMOTE_MODEL_ID) return null;
  if (installed.length === 0) return null;

  const chosen = installed.find((m) => m.modelId === settings.activeModelId);
  if (chosen) return chosen;

  return [...installed].sort((a, b) => b.installedAt - a.installedAt)[0] ?? null;
}

// Resolves the online API only while it is still switched on - a stale
// activeModelId left over from before it was disabled must fall back to a
// local model rather than stranding Chat on a backend that is off.
export async function resolveActiveSelection(): Promise<ActiveSelection> {
  const settings = await loadSettings();
  if (settings.activeModelId === REMOTE_MODEL_ID && settings.remoteEnabled) {
    return { kind: 'remote' };
  }
  const model = await resolveActiveModel();
  return model ? { kind: 'local', model } : { kind: 'none' };
}

export async function setActiveModel(modelId: string): Promise<void> {
  // Clears any stale crash-risk flag left by a previously active model - it
  // no longer describes the model about to load (see AppSettings.pendingLoadModelId).
  await patchSettings({ activeModelId: modelId, pendingLoadModelId: null });
}
