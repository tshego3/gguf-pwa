import { describe, expect, it } from 'vitest';
import { buildPromptWithAttachments, classifyAttachment, createAttachment } from './attachments';
import type { Attachment } from '../types';

function file(name: string, type: string, content = 'hello'): File {
  return new File([content], name, { type });
}

function attachment(partial: Partial<Attachment>): Attachment {
  return { id: 'x', kind: 'text', name: 'a.txt', bytes: 1, text: null, images: null, ...partial };
}

describe('classifyAttachment', () => {
  it('recognises images by mime type', () => {
    expect(classifyAttachment(file('photo.png', 'image/png'))).toBe('image');
    expect(classifyAttachment(file('photo.jpg', 'image/jpeg'))).toBe('image');
  });

  it('recognises video by mime type or extension', () => {
    expect(classifyAttachment(file('clip.mp4', 'video/mp4'))).toBe('video');
    expect(classifyAttachment(file('clip.webm', 'video/webm'))).toBe('video');
    expect(classifyAttachment(file('clip.mov', ''))).toBe('video');
  });

  it('recognises a pdf by mime type or extension', () => {
    expect(classifyAttachment(file('doc.pdf', 'application/pdf'))).toBe('pdf');
    expect(classifyAttachment(file('doc.pdf', ''))).toBe('pdf');
  });

  it('recognises text by mime type or extension', () => {
    expect(classifyAttachment(file('notes.txt', 'text/plain'))).toBe('text');
    expect(classifyAttachment(file('data.csv', ''))).toBe('text');
    expect(classifyAttachment(file('readme.md', ''))).toBe('text');
  });

  it('rejects an unsupported type rather than guessing', () => {
    expect(classifyAttachment(file('archive.zip', 'application/zip'))).toBeNull();
  });
});

describe('createAttachment', () => {
  it('extracts text content for a text file', async () => {
    const result = await createAttachment(file('notes.txt', 'text/plain', 'the body'));
    expect(result.kind).toBe('text');
    expect(result.text).toBe('the body');
    expect(result.images).toBeNull();
  });

  it('keeps raw bytes for an image and no text', async () => {
    const result = await createAttachment(file('photo.png', 'image/png', 'binary'));
    expect(result.kind).toBe('image');
    expect(result.images).toHaveLength(1);
    expect(result.images?.[0]).toBeInstanceOf(ArrayBuffer);
    expect(result.text).toBeNull();
  });

  it('refuses an unsupported file with a user-safe message', async () => {
    await expect(createAttachment(file('archive.zip', 'application/zip'))).rejects.toMatchObject({
      type: 'load',
      message: expect.stringContaining('cannot be attached'),
    });
  });

  it('refuses an oversized text file rather than reading it into memory', async () => {
    const huge = new File(['x'.repeat(10)], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(huge, 'size', { value: 5 * 1024 * 1024 });
    await expect(createAttachment(huge)).rejects.toMatchObject({ type: 'load' });
  });
});

describe('buildPromptWithAttachments', () => {
  it('returns the text unchanged when nothing is attached', () => {
    expect(buildPromptWithAttachments('hi', [])).toBe('hi');
  });

  it('ignores video attachments, which travel as sampled frames not prompt text', () => {
    const video = attachment({ kind: 'video', name: 'clip.mp4', images: [new ArrayBuffer(1), new ArrayBuffer(1)] });
    expect(buildPromptWithAttachments('what happens', [video])).toBe('what happens');
  });

  it('ignores image attachments, which travel as bytes not prompt text', () => {
    const image = attachment({ kind: 'image', name: 'p.png', images: [new ArrayBuffer(1)] });
    expect(buildPromptWithAttachments('describe it', [image])).toBe('describe it');
  });

  it('wraps document text in a labelled block ahead of the question', () => {
    const doc = attachment({ name: 'notes.txt', text: 'body text' });
    const result = buildPromptWithAttachments('summarise', [doc]);
    expect(result).toBe('<file name="notes.txt">\nbody text\n</file>\n\nsummarise');
  });

  it('includes every attached document', () => {
    const a = attachment({ id: 'a', name: 'a.txt', text: 'A' });
    const b = attachment({ id: 'b', name: 'b.txt', text: 'B' });
    const result = buildPromptWithAttachments('compare', [a, b]);
    expect(result).toContain('name="a.txt"');
    expect(result).toContain('name="b.txt"');
    expect(result.endsWith('compare')).toBe(true);
  });
});
