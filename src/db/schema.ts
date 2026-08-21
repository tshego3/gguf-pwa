import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, ChatMessage, Conversation, InstalledModel, SavedPrompt } from '../types';

const DB_NAME = 'gguf-db';
const DB_VERSION = 2;

export interface GgufDbSchema extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { 'by-updatedAt': number };
  };
  messages: {
    key: [string, number];
    value: ChatMessage;
    indexes: { 'by-conversationId': string };
  };
  settings: {
    key: string;
    value: unknown;
  };
  installedModels: {
    key: string;
    value: InstalledModel;
  };
  fileHandles: {
    key: string;
    // FileSystemFileHandle is structured-cloneable in browsers that support it.
    value: FileSystemFileHandle;
  };
  prompts: {
    key: string;
    value: SavedPrompt;
  };
}

let dbPromise: Promise<IDBPDatabase<GgufDbSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<GgufDbSchema>> {
  dbPromise ??= openDB<GgufDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Each branch is guarded by oldVersion so an existing v1 database
      // upgrades in place - creating a store that already exists throws.
      if (oldVersion < 1) {
        const conversations = db.createObjectStore('conversations', { keyPath: 'id' });
        conversations.createIndex('by-updatedAt', 'updatedAt');

        const messages = db.createObjectStore('messages', { keyPath: ['conversationId', 'seq'] });
        messages.createIndex('by-conversationId', 'conversationId');

        db.createObjectStore('settings');
        db.createObjectStore('installedModels', { keyPath: 'modelId' });
        db.createObjectStore('fileHandles');
      }
      if (oldVersion < 2) {
        db.createObjectStore('prompts', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

// Test-only: closes the current connection and forces the next getDb() call
// to reopen a fresh one. A stale open connection blocks
// indexedDB.deleteDatabase() (fake-indexeddb enforces this like real
// IndexedDB), which is why tests must await this before deleting.
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
}

export type { AppSettings };
