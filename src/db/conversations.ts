import { getDb } from './schema';
import type { Conversation } from '../types';

export async function createConversation(conversation: Conversation): Promise<void> {
  const db = await getDb();
  await db.put('conversations', conversation);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDb();
  return db.get('conversations', id);
}

export async function listConversations(): Promise<readonly Conversation[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('conversations', 'by-updatedAt');
  return [...all].reverse();
}

export async function updateConversation(
  id: string,
  patch: Partial<Omit<Conversation, 'id'>>,
): Promise<Conversation> {
  const db = await getDb();
  const existing = await db.get('conversations', id);
  if (!existing) {
    throw { type: 'load', message: `Conversation ${id} does not exist` };
  }
  const updated: Conversation = { ...existing, ...patch };
  await db.put('conversations', updated);
  return updated;
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['conversations', 'messages'], 'readwrite');
  await tx.objectStore('conversations').delete(id);

  const messageStore = tx.objectStore('messages');
  const index = messageStore.index('by-conversationId');
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}
