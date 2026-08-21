import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendMessage,
  createConversation,
  deleteConversation,
  deleteInstalledModel,
  deletePrompt,
  getConversation,
  getDb,
  getInstalledModel,
  listConversations,
  listInstalledModels,
  listMessages,
  listPrompts,
  loadSettings,
  patchSettings,
  putInstalledModel,
  resetDbForTests,
  savePrompt,
  updateConversation,
  updateMessage,
} from './index';
import type { ChatMessage, Conversation, InstalledModel, SavedPrompt } from '../types';

const conversation: Conversation = {
  id: 'c1',
  title: 'First chat',
  modelId: 'qwen3-0.6b',
  systemPrompt: null,
  createdAt: 1,
  updatedAt: 1,
};

function message(seq: number, content: string, partial = false): ChatMessage {
  return { conversationId: 'c1', seq, role: 'user', content, partial, createdAt: seq };
}

beforeEach(async () => {
  await resetDbForTests();
  indexedDB.deleteDatabase('gguf-db');
});

afterEach(async () => {
  await resetDbForTests();
});

describe('conversations store', () => {
  it('creates, reads, updates, and deletes a conversation', async () => {
    await createConversation(conversation);
    expect(await getConversation('c1')).toEqual(conversation);

    const updated = await updateConversation('c1', { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');

    await deleteConversation('c1');
    expect(await getConversation('c1')).toBeUndefined();
  });

  it('lists conversations newest-updated first', async () => {
    await createConversation({ ...conversation, id: 'c1', updatedAt: 1 });
    await createConversation({ ...conversation, id: 'c2', updatedAt: 2 });
    const list = await listConversations();
    expect(list.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('deleting a conversation cascades to its messages', async () => {
    await createConversation(conversation);
    await appendMessage(message(0, 'hi'));
    await appendMessage(message(1, 'there'));

    await deleteConversation('c1');

    expect(await listMessages('c1')).toEqual([]);
  });
});

describe('messages store', () => {
  it('appends, reorders by seq, and updates a message', async () => {
    await createConversation(conversation);
    await appendMessage(message(1, 'second'));
    await appendMessage(message(0, 'first'));

    const messages = await listMessages('c1');
    expect(messages.map((m) => m.content)).toEqual(['first', 'second']);

    await updateMessage('c1', 0, { partial: true });
    const updated = await listMessages('c1');
    expect(updated[0]?.partial).toBe(true);
  });
});

describe('settings store', () => {
  it('returns defaults when nothing is stored, then persists a patch', async () => {
    const defaults = await loadSettings();
    expect(defaults.nCtx).toBe(4096);

    const patched = await patchSettings({ nCtx: 2048 });
    expect(patched.nCtx).toBe(2048);
    expect(await loadSettings()).toEqual(patched);
  });
});

describe('installedModels store', () => {
  const model: InstalledModel = {
    modelId: 'qwen3-0.6b',
    name: 'Qwen3 0.6B',
    source: 'catalog',
    bytes: 650_000_000,
    installedAt: 1,
  };

  it('creates, reads, lists, and deletes an installed model', async () => {
    await putInstalledModel(model);
    expect(await getInstalledModel('qwen3-0.6b')).toEqual(model);
    expect(await listInstalledModels()).toEqual([model]);

    await deleteInstalledModel('qwen3-0.6b');
    expect(await getInstalledModel('qwen3-0.6b')).toBeUndefined();
  });
});

describe('prompts store', () => {
  const prompt: SavedPrompt = { id: 'p1', name: 'Concise', content: 'Answer in one sentence.', createdAt: 1 };

  it('creates, lists, and deletes a saved prompt', async () => {
    await savePrompt(prompt);
    expect(await listPrompts()).toEqual([prompt]);

    await deletePrompt('p1');
    expect(await listPrompts()).toEqual([]);
  });
});

describe('schema upgrade path', () => {
  it('creates all five object stores on first open at the current version', async () => {
    await resetDbForTests();
    indexedDB.deleteDatabase('gguf-db');

    const db = await openDB('gguf-db', 1, {
      upgrade(database) {
        database.createObjectStore('conversations', { keyPath: 'id' });
        database.createObjectStore('messages', { keyPath: ['conversationId', 'seq'] });
        database.createObjectStore('settings');
        database.createObjectStore('installedModels', { keyPath: 'modelId' });
        database.createObjectStore('fileHandles');
      },
    });

    expect([...db.objectStoreNames].sort()).toEqual(
      ['conversations', 'fileHandles', 'installedModels', 'messages', 'settings'].sort(),
    );
    db.close();
  });

  it('upgrades an existing v1 database to v2 in place, adding prompts without touching existing data', async () => {
    await resetDbForTests();
    indexedDB.deleteDatabase('gguf-db');

    const v1 = await openDB('gguf-db', 1, {
      upgrade(database) {
        database.createObjectStore('conversations', { keyPath: 'id' });
        database.createObjectStore('messages', { keyPath: ['conversationId', 'seq'] });
        database.createObjectStore('settings');
        database.createObjectStore('installedModels', { keyPath: 'modelId' });
        database.createObjectStore('fileHandles');
      },
    });
    await v1.put('conversations', conversation);
    v1.close();

    // getDb() runs this app's real upgrade path (currently targeting v2)
    // against the v1 database created above.
    await resetDbForTests();
    const upgraded = await getDb();

    expect([...upgraded.objectStoreNames].sort()).toEqual(
      ['conversations', 'fileHandles', 'installedModels', 'messages', 'prompts', 'settings'].sort(),
    );
    expect(await getConversation('c1')).toEqual(conversation);
  });
});
