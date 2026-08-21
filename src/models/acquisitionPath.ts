import type { EngineCapabilities } from '../types';

export type LocalAcquisitionPath = 'file-system-access' | 'input-opfs';

// Chosen from the capability probe, never from a user-agent string - a
// browser can gain or lose the File System Access API independent of what
// platform it reports (P2-T6).
export function selectLocalAcquisitionPath(capabilities: Pick<EngineCapabilities, 'fileSystemAccess'>): LocalAcquisitionPath {
  return capabilities.fileSystemAccess ? 'file-system-access' : 'input-opfs';
}

export function describeStorageConsequence(path: LocalAcquisitionPath): string | null {
  if (path === 'file-system-access') return null;
  return 'This copies the model into on-device storage. It will use roughly the same space again, on top of the original file.';
}
