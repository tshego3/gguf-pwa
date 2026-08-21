import { getDb } from './schema';
import type { SavedPrompt } from '../types';

export async function listPrompts(): Promise<readonly SavedPrompt[]> {
  const db = await getDb();
  const all = await db.getAll('prompts');
  return [...all].sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePrompt(prompt: SavedPrompt): Promise<void> {
  const db = await getDb();
  await db.put('prompts', prompt);
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('prompts', id);
}
