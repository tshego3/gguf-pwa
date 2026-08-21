import { putInstalledModel } from '../db';
import type { InstalledModel } from '../types';
import { copyFileToOpfs, deleteFileFromOpfs, readFileFromOpfs, type OpfsCopyProgress } from './opfs';
import { validateGgufFile } from './validateGguf';

// iOS Safari and Firefox path: no File System Access API, and a plain File
// object does not survive a reload, so the file is stream-copied into OPFS
// once. The storage cost must be shown to the caller before the copy starts
// - this module only performs the copy, the UI is responsible for consent.

function opfsKey(modelId: string, fileName: string): string {
  return `${modelId}::${fileName}`;
}

export async function copyLocalFilesToOpfs(
  modelId: string,
  displayName: string,
  files: readonly File[],
  onProgress?: (fileIndex: number, progress: OpfsCopyProgress) => void,
): Promise<InstalledModel> {
  if (files.length === 0) {
    throw { type: 'load', message: 'No file was selected.' };
  }

  let totalBytes = 0;
  const fileNames: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    const validation = await validateGgufFile(file);
    if (!validation.valid) {
      throw { type: 'load', message: validation.reason };
    }

    await copyFileToOpfs(opfsKey(modelId, file.name), file, (progress) => onProgress?.(i, progress));
    totalBytes += file.size;
    fileNames.push(file.name);
  }

  const installed: InstalledModel = {
    modelId,
    name: displayName,
    source: 'local-file',
    bytes: totalBytes,
    installedAt: Date.now(),
    fileNames,
  };
  await putInstalledModel(installed);
  return installed;
}

export async function loadLocalFilesFromOpfs(model: InstalledModel): Promise<Blob[] | null> {
  if (!model.fileNames || model.fileNames.length === 0) return null;

  const blobs: Blob[] = [];
  for (const fileName of model.fileNames) {
    const file = await readFileFromOpfs(opfsKey(model.modelId, fileName));
    if (!file) return null;
    blobs.push(file);
  }
  return blobs;
}

export async function deleteLocalFilesFromOpfs(model: InstalledModel): Promise<void> {
  for (const fileName of model.fileNames ?? []) {
    await deleteFileFromOpfs(opfsKey(model.modelId, fileName));
  }
}
