import type { EngineCapabilities, Platform } from '../types';
import { selectBackendTier } from './tierSelection';

// Pure detection module. No @wllama/wllama import - this file only reads
// browser/platform features and never touches the inference runtime.

interface NavigatorStorageEstimate {
  quota?: number;
  usage?: number;
}

interface NavigatorWithExtras extends Navigator {
  readonly deviceMemory?: number;
  readonly userAgentData?: { readonly platform?: string };
}

function detectPlatform(nav: NavigatorWithExtras): Platform {
  const uaPlatform = nav.userAgentData?.platform ?? nav.platform ?? '';
  const ua = nav.userAgent ?? '';
  const hay = `${uaPlatform} ${ua}`.toLowerCase();

  if (/iphone|ipad|ipod/.test(hay)) return 'ios';
  if (/android/.test(hay)) return 'android';
  if (/win/.test(hay)) return 'windows';
  if (/mac/.test(hay)) return 'macos';
  if (/linux/.test(hay)) return 'linux';
  return 'unknown';
}

async function detectWebGpu(nav: Navigator): Promise<{
  webgpu: boolean;
  maxBufferSize: number | null;
  maxStorageBufferBindingSize: number | null;
}> {
  const gpu = (nav as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { webgpu: false, maxBufferSize: null, maxStorageBufferBindingSize: null };

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { webgpu: false, maxBufferSize: null, maxStorageBufferBindingSize: null };
    return {
      webgpu: true,
      maxBufferSize: adapter.limits.maxBufferSize ?? null,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize ?? null,
    };
  } catch {
    return { webgpu: false, maxBufferSize: null, maxStorageBufferBindingSize: null };
  }
}

async function detectStorageEstimate(): Promise<{ quota: number | null; usage: number | null }> {
  if (!navigator.storage?.estimate) return { quota: null, usage: null };
  try {
    const estimate: NavigatorStorageEstimate = await navigator.storage.estimate();
    return { quota: estimate.quota ?? null, usage: estimate.usage ?? null };
  } catch {
    return { quota: null, usage: null };
  }
}

// A feature-detect (typeof check) alone reports Safari's Private Browsing
// as OPFS-capable, because the function exists there - it just throws
// "UnknownError: the operation failed for an unknown transient reason"
// the moment it is actually called, confirmed against real Safari. This
// makes the actual call and treats any failure as unavailable, so the UI
// can warn before the user hits that error three steps into a download
// instead of after.
async function detectOpfs(nav: Navigator): Promise<boolean> {
  if (typeof nav.storage?.getDirectory !== 'function') return false;
  try {
    await nav.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

function detectFileSystemAccess(): boolean {
  return typeof (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

function detectIsFirefox(nav: Navigator): boolean {
  return /firefox/i.test(nav.userAgent) && !/seamonkey/i.test(nav.userAgent);
}

// Reads every raw signal, then hands them to the pure tier-selection function
// so the decision logic itself stays independently testable against mocks.
export async function probeCapabilities(): Promise<EngineCapabilities> {
  const nav = navigator as NavigatorWithExtras;
  const [gpuInfo, storage, opfs] = await Promise.all([detectWebGpu(nav), detectStorageEstimate(), detectOpfs(nav)]);

  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const crossOriginIsolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const isFirefox = detectIsFirefox(nav);

  const tier = selectBackendTier({
    webgpu: gpuInfo.webgpu,
    isFirefox,
    crossOriginIsolated,
    sharedArrayBuffer,
    override: 'auto',
  });

  return {
    tier,
    webgpu: gpuInfo.webgpu,
    webgpuMaxBufferSize: gpuInfo.maxBufferSize,
    webgpuMaxStorageBufferBindingSize: gpuInfo.maxStorageBufferBindingSize,
    sharedArrayBuffer,
    crossOriginIsolated,
    fileSystemAccess: detectFileSystemAccess(),
    opfs,
    storageQuotaBytes: storage.quota,
    storageUsageBytes: storage.usage,
    deviceMemoryGb: nav.deviceMemory ?? null,
    hardwareConcurrency: nav.hardwareConcurrency ?? 1,
    platform: detectPlatform(nav),
    isFirefox,
  };
}
