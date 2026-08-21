import type { CatalogModel } from '../types';
import { checkModelFit } from './deviceTiers';

export interface PreflightWarning {
  readonly kind: 'memory' | 'storage' | 'cellular' | 'save-data';
  readonly message: string;
}

interface NetworkInformation {
  readonly type?: string;
  readonly saveData?: boolean;
}

function getConnection(): NetworkInformation | null {
  const nav = navigator as Navigator & { connection?: NetworkInformation };
  return nav.connection ?? null;
}

// Every check here warns and never blocks - the user always decides,
// per the "warn, never block" rule for device-capability checks (P2-T8).
export async function runPreflightChecks(
  model: CatalogModel,
  deviceMemoryGb: number | null,
): Promise<readonly PreflightWarning[]> {
  const warnings: PreflightWarning[] = [];

  const fit = checkModelFit(model, deviceMemoryGb);
  if (!fit.fits && fit.warning) {
    warnings.push({ kind: 'memory', message: fit.warning });
  }

  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ?? null;
    const usage = estimate.usage ?? null;
    if (quota !== null && usage !== null) {
      const remaining = quota - usage;
      if (model.bytes > remaining) {
        const remainingGb = (remaining / 1024 ** 3).toFixed(2);
        const modelGb = (model.bytes / 1024 ** 3).toFixed(2);
        warnings.push({
          kind: 'storage',
          message: `Only about ${remainingGb} GB of storage is free, and ${model.name} needs ${modelGb} GB. The download may fail partway through.`,
        });
      }
    }
  }

  const connection = getConnection();
  if (connection?.saveData) {
    warnings.push({
      kind: 'save-data',
      message: 'This device has Data Saver on. Downloading a large model may use a noticeable amount of data.',
    });
  } else if (connection?.type === 'cellular') {
    const modelGb = (model.bytes / 1024 ** 3).toFixed(2);
    warnings.push({
      kind: 'cellular',
      message: `You're on a cellular connection. ${model.name} is ${modelGb} GB and may count against a mobile data plan.`,
    });
  }

  return warnings;
}
