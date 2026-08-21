import { downloadModelShards, getCachedModelIfValid, removeDownloadedModel } from '../engine/modelManager';
import { putInstalledModel } from '../db';
import type { CatalogModel, DownloadProgress, InstalledModel } from '../types';

// Fetches from the original Hugging Face repository directly - never a
// mirror or proxy. HF serves resolve/ URLs with Access-Control-Allow-Origin:
// *, so no CORS proxy is needed here.
export function catalogModelUrls(model: CatalogModel): readonly string[] {
  return model.files.map((file) => `https://huggingface.co/${model.repo}/resolve/main/${file}`);
}

export async function downloadCatalogModel(
  model: CatalogModel,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<InstalledModel> {
  const urls = catalogModelUrls(model);
  const handle = await downloadModelShards(urls, onProgress, signal);

  const installed: InstalledModel = {
    modelId: model.id,
    name: model.name,
    source: 'catalog',
    bytes: handle.bytes,
    installedAt: Date.now(),
    fileNames: [...model.files],
  };
  await putInstalledModel(installed);
  return installed;
}

// Cache-only lookup - never triggers a network download. Used to check
// whether a catalog model that was previously installed is still present
// after possible eviction (P2-T12), without silently re-downloading it.
export async function loadCachedCatalogModelBlobs(model: CatalogModel): Promise<Blob[] | null> {
  const handle = await getCachedModelIfValid(catalogModelUrls(model));
  return handle ? handle.open() : null;
}

export async function deleteCatalogModel(model: CatalogModel): Promise<void> {
  await removeDownloadedModel(catalogModelUrls(model));
}
