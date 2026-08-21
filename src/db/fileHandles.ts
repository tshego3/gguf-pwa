import { getDb } from './schema';

export async function putFileHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await getDb();
  await db.put('fileHandles', handle, key);
}

export async function getFileHandle(key: string): Promise<FileSystemFileHandle | undefined> {
  const db = await getDb();
  return db.get('fileHandles', key);
}

export async function deleteFileHandle(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('fileHandles', key);
}
