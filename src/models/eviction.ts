import type { InstalledModel } from '../types';
import { loadCachedCatalogModelBlobs, catalogModelUrls } from './downloadManager';
import { loadLocalFilesFromOpfs } from './localFileInput';
import { reacquireLocalFiles } from './localFileAccess';
import type { CatalogModel } from '../types';

export type ModelAvailability =
  | { readonly status: 'available'; readonly blobs: Blob[] }
  | { readonly status: 'needs-permission' }
  | { readonly status: 'missing' };

// Resolves whether an installed model's bytes are actually reachable right
// now. Eviction (browser storage pressure, cleared site data, a deleted
// local file) is a normal state here, never an error - the caller turns
// "missing" or "needs-permission" into a re-acquire prompt (P2-T12).
export async function resolveModelAvailability(
  model: InstalledModel,
  catalogEntry: CatalogModel | undefined,
): Promise<ModelAvailability> {
  if (model.source === 'local-handle') {
    const result = await reacquireLocalFiles(model);
    if (result.status === 'ok') return { status: 'available', blobs: result.blobs };
    if (result.status === 'permission-denied') return { status: 'needs-permission' };
    return { status: 'missing' };
  }

  if (model.source === 'local-file') {
    const blobs = await loadLocalFilesFromOpfs(model);
    return blobs ? { status: 'available', blobs } : { status: 'missing' };
  }

  // Catalog model: ask wllama's cache for the same URLs used to download it.
  // A cache miss (evicted) resolves to "missing", which the UI turns into a
  // re-download prompt with the model preselected, not an error screen.
  if (!catalogEntry) return { status: 'missing' };

  const blobs = await loadCachedCatalogModelBlobs(catalogEntry);
  return blobs ? { status: 'available', blobs } : { status: 'missing' };
}

export function catalogUrlsForModel(catalogEntry: CatalogModel): readonly string[] {
  return catalogModelUrls(catalogEntry);
}
