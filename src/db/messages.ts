import { getDb } from './schema';
import type { ChatMessage } from '../types';

export async function appendMessage(message: ChatMessage): Promise<void> {
  const db = await getDb();
  await db.put('messages', message);
}

export async function listMessages(conversationId: string): Promise<readonly ChatMessage[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('messages', 'by-conversationId', conversationId);
  return [...all].sort((a, b) => a.seq - b.seq);
}

export async function updateMessage(
  conversationId: string,
  seq: number,
  patch: Partial<Omit<ChatMessage, 'conversationId' | 'seq'>>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('messages', [conversationId, seq]);
  if (!existing) {
    throw { type: 'load', message: `Message ${conversationId}/${seq} does not exist` };
  }
  await db.put('messages', { ...existing, ...patch });
}

export async function nextSeq(conversationId: string): Promise<number> {
  const messages = await listMessages(conversationId);
  const last = messages.at(-1);
  return last ? last.seq + 1 : 0;
}
