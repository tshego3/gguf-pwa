import { deleteFileHandle, getFileHandle, putFileHandle } from '../db';
import { putInstalledModel } from '../db';
import type { InstalledModel } from '../types';
import { validateGgufFile } from './validateGguf';

// Windows and Android Chrome/Edge path: the File System Access API keeps a
// live handle to the file where the user put it. Nothing is copied, so
// storage cost is zero, and the handle survives a reload once persisted.

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

type ShowOpenFilePicker = (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;

function getShowOpenFilePicker(): ShowOpenFilePicker | null {
  const picker = (window as Window & { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
  return typeof picker === 'function' ? picker : null;
}

export function deriveHandleKey(modelId: string, fileName: string): string {
  return `${modelId}::${fileName}`;
}

export async function isFileSystemAccessSupported(): Promise<boolean> {
  return getShowOpenFilePicker() !== null;
}

// Opens the native picker, validates every selected file as GGUF, persists
// each FileSystemFileHandle, and writes one InstalledModel record covering
// all shards. Throws a typed load error on the first invalid file.
export async function pickAndPersistLocalFiles(modelId: string, displayName: string): Promise<InstalledModel> {
  const showOpenFilePicker = getShowOpenFilePicker();
  if (!showOpenFilePicker) {
    throw { type: 'unsupported', message: 'This browser cannot remember a picked file across reloads.' };
  }

  const handles = await showOpenFilePicker({
    multiple: true,
    excludeAcceptAllOption: false,
    types: [{ description: 'GGUF model', accept: { 'application/octet-stream': ['.gguf'] } }],
  });

  let totalBytes = 0;
  const fileNames: string[] = [];

  for (const handle of handles) {
    const file = await handle.getFile();
    const validation = await validateGgufFile(file);
    if (!validation.valid) {
      throw { type: 'load', message: validation.reason };
    }
    totalBytes += file.size;
    fileNames.push(file.name);
    await putFileHandle(deriveHandleKey(modelId, file.name), handle);
  }

  const installed: InstalledModel = {
    modelId,
    name: displayName,
    source: 'local-handle',
    bytes: totalBytes,
    installedAt: Date.now(),
    handleKey: modelId,
    fileNames,
  };
  await putInstalledModel(installed);
  return installed;
}

export type ReacquireResult =
  | { readonly status: 'ok'; readonly blobs: Blob[] }
  | { readonly status: 'permission-denied' }
  | { readonly status: 'missing' };

// Re-acquires every shard's handle on startup, prompting for permission if
// the browser downgraded it since the last session. No file is copied.
export async function reacquireLocalFiles(model: InstalledModel): Promise<ReacquireResult> {
  if (!model.fileNames || model.fileNames.length === 0) return { status: 'missing' };

  const blobs: Blob[] = [];
  for (const fileName of model.fileNames) {
    // getFileHandle can throw rather than resolve on a browser that fails
    // to structured-clone a FileSystemFileHandle back out of IndexedDB
    // (seen on Samsung Internet) - treated the same as "not found", since
    // either way the stored handle is unusable.
    let handle: FileSystemFileHandle | undefined;
    try {
      handle = await getFileHandle(deriveHandleKey(model.modelId, fileName));
    } catch {
      return { status: 'missing' };
    }
    if (!handle) return { status: 'missing' };

    const handleWithPermissions = handle as FileSystemFileHandle & {
      queryPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
    };

    let permission = (await handleWithPermissions.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (permission !== 'granted') {
      permission = (await handleWithPermissions.requestPermission?.({ mode: 'read' })) ?? 'denied';
    }
    if (permission !== 'granted') return { status: 'permission-denied' };

    try {
      blobs.push(await handle.getFile());
    } catch {
      return { status: 'missing' };
    }
  }

  return { status: 'ok', blobs };
}

export async function forgetLocalFiles(model: InstalledModel): Promise<void> {
  for (const fileName of model.fileNames ?? []) {
    await deleteFileHandle(deriveHandleKey(model.modelId, fileName));
  }
}
