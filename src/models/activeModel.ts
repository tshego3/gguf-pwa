import { listInstalledModels, loadSettings, patchSettings } from '../db';
import type { InstalledModel } from '../types';

// The model most recently installed becomes active by default; an explicit
// choice in settings overrides that. There is always at most one active
// model, matching the engine's single-residency rule.
export async function resolveActiveModel(): Promise<InstalledModel | null> {
  const [settings, installed] = await Promise.all([loadSettings(), listInstalledModels()]);
  if (installed.length === 0) return null;

  const chosen = installed.find((m) => m.modelId === settings.activeModelId);
  if (chosen) return chosen;

  return [...installed].sort((a, b) => b.installedAt - a.installedAt)[0] ?? null;
}

export async function setActiveModel(modelId: string): Promise<void> {
  // Clears any stale crash-risk flag left by a previously active model - it
  // no longer describes the model about to load (see AppSettings.pendingLoadModelId).
  await patchSettings({ activeModelId: modelId, pendingLoadModelId: null });
}
