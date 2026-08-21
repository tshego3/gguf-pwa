import { fetchCatalog } from './catalog';
import { resolveActiveModel } from './activeModel';
import { resolveModelAvailability } from './eviction';
import type { InstalledModel } from '../types';

export type PrepareChatModelResult =
  | { readonly status: 'none-installed' }
  | { readonly status: 'needs-permission'; readonly model: InstalledModel }
  | { readonly status: 'missing'; readonly model: InstalledModel }
  | { readonly status: 'ready'; readonly model: InstalledModel; readonly blobs: Blob[] };

// Ties together "which model is active" (activeModel.ts) and "are its bytes
// actually reachable right now" (eviction.ts) into the one call the chat
// screen needs before it can load the engine.
export async function prepareChatModel(): Promise<PrepareChatModelResult> {
  const active = await resolveActiveModel();
  if (!active) return { status: 'none-installed' };

  const catalog = active.source === 'catalog' ? await fetchCatalog() : [];
  const catalogEntry = catalog.find((m) => m.id === active.modelId);

  const availability = await resolveModelAvailability(active, catalogEntry);
  if (availability.status === 'available') {
    return { status: 'ready', model: active, blobs: availability.blobs };
  }
  if (availability.status === 'needs-permission') {
    return { status: 'needs-permission', model: active };
  }
  return { status: 'missing', model: active };
}
