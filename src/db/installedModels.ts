import { getDb } from './schema';
import type { InstalledModel } from '../types';

export async function putInstalledModel(model: InstalledModel): Promise<void> {
  const db = await getDb();
  await db.put('installedModels', model);
}

export async function getInstalledModel(modelId: string): Promise<InstalledModel | undefined> {
  const db = await getDb();
  return db.get('installedModels', modelId);
}

export async function listInstalledModels(): Promise<readonly InstalledModel[]> {
  const db = await getDb();
  return db.getAll('installedModels');
}

export async function deleteInstalledModel(modelId: string): Promise<void> {
  const db = await getDb();
  await db.delete('installedModels', modelId);
}
