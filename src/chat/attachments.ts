import type { Attachment, AttachmentKind } from '../types';
import { extractVideoFrames } from './videoFrames';

// Turns a picked file into an Attachment. Every path here validates before
// it reads: an attachment is untrusted input just like model output, and a
// 200 MB "text" file would otherwise be pulled into memory whole on a phone.

// Deliberately small. These are prompt inputs, not documents to archive -
// anything larger will not fit a 2k-4k context window anyway, and reading
// it would only cost memory the engine needs.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// Decoding streams from an object URL rather than reading the file into
// memory, so this cap is about sane frame-sampling time, not RAM.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

// Truncation keeps a pathological file from silently eating the whole
// context window; the caller shows the notice this appends.
const MAX_EXTRACTED_CHARS = 60_000;
const MAX_PDF_PAGES = 100;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Split so the composer can offer the document half to every model and the
// vision half only to a model that reports image support.
export const DOCUMENT_ACCEPT = '.txt,.md,.csv,.json,.log,.pdf';
export const VISION_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
export const ATTACHMENT_ACCEPT = `${DOCUMENT_ACCEPT},${VISION_ACCEPT}`;

function formatMb(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function classifyAttachment(file: File): AttachmentKind | null {
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) return 'video';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(file.name)) return 'text';
  return null;
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[truncated - the file was longer than this model can read]`;
}

async function readText(file: File): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) {
    throw { type: 'load', message: `Text files are limited to ${formatMb(MAX_TEXT_BYTES)}.` };
  }
  return truncate(await file.text());
}

// pdfjs is imported dynamically so its worker and font data stay out of the
// initial bundle - most sessions never attach a PDF, and the app already
// ships an 8 MB WASM binary it cannot avoid.
async function readPdf(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw { type: 'load', message: `PDFs are limited to ${formatMb(MAX_PDF_BYTES)}.` };
  }

  const pdfjs = await import('pdfjs-dist');
  // Vite resolves this to a hashed asset URL at build time, so the worker
  // is served from our own origin and works offline. Without it pdfjs tries
  // to fetch its worker from a CDN, which the CSP blocks by design.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  // destroy() lives on the loading task, not the document - it is what
  // tears down the pdfjs worker, so the reference has to be kept.
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;

  try {
    const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) pages.push(pageText);
      page.cleanup();
    }

    if (pages.length === 0) {
      throw {
        type: 'load',
        message: 'No text could be read from this PDF. It may be a scan rather than a text document.',
      };
    }

    return truncate(pages.join('\n\n'));
  } finally {
    await loadingTask.destroy();
  }
}

async function readImage(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw { type: 'load', message: `Images are limited to ${formatMb(MAX_IMAGE_BYTES)}.` };
  }
  return file.arrayBuffer();
}

async function readVideo(file: File): Promise<readonly ArrayBuffer[]> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw { type: 'load', message: `Videos are limited to ${formatMb(MAX_VIDEO_BYTES)}.` };
  }
  const { frames } = await extractVideoFrames(file);
  if (frames.length === 0) {
    throw { type: 'load', message: 'No frames could be read from this video.' };
  }
  return frames;
}

export async function createAttachment(file: File): Promise<Attachment> {
  const kind = classifyAttachment(file);
  if (!kind) {
    throw {
      type: 'load',
      message: 'That file type cannot be attached. Use an image, a video, a PDF, or a text file.',
    };
  }

  const base = { id: crypto.randomUUID(), kind, name: file.name, bytes: file.size } as const;

  if (kind === 'image') {
    return { ...base, text: null, images: [await readImage(file)] };
  }
  if (kind === 'video') {
    return { ...base, text: null, images: await readVideo(file) };
  }
  const text = kind === 'pdf' ? await readPdf(file) : await readText(file);
  return { ...base, text, images: null };
}

// Attached text is folded into the prompt as a labelled block so the model
// can tell the document apart from the user's own words.
export function buildPromptWithAttachments(text: string, attachments: readonly Attachment[]): string {
  const documents = attachments.filter((attachment) => attachment.text !== null);
  if (documents.length === 0) return text;

  const blocks = documents.map((attachment) => `<file name="${attachment.name}">\n${attachment.text}\n</file>`);
  return `${blocks.join('\n\n')}\n\n${text}`;
}
