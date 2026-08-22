export type ChatRole = 'system' | 'user' | 'assistant';

export type AttachmentKind = 'image' | 'video' | 'text' | 'pdf';

// What the composer holds before a message is sent. Text and PDF collapse
// to extracted `text`. Image and video both collapse to `images`: the
// runtime has no video modality, so a video is sampled into still frames
// and travels as several image parts, which is the form these models were
// trained on. An image is simply the one-frame case.
export interface Attachment {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly name: string;
  readonly bytes: number;
  readonly text: string | null;
  readonly images: readonly ArrayBuffer[] | null;
}

// What survives in the transcript. Image bytes are deliberately not
// persisted - a conversation lives in IndexedDB, and putting binary blobs
// there is the same mistake as storing weights in it. The name and kind are
// enough to render what was attached; regenerating a turn that had an image
// therefore re-sends the text only, which the UI states plainly.
export interface AttachmentRef {
  readonly kind: AttachmentKind;
  readonly name: string;
}

export interface ChatMessage {
  readonly conversationId: string;
  readonly seq: number;
  readonly role: ChatRole;
  readonly content: string;
  readonly partial: boolean;
  readonly createdAt: number;
  readonly attachments?: readonly AttachmentRef[];
}

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly modelId: string | null;
  readonly systemPrompt: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GenerationParams {
  readonly nCtx: number;
  readonly temperature: number;
  readonly topK: number;
  readonly topP: number;
  readonly maxTokens: number;
  readonly seed: number | null;
  readonly systemPrompt: string | null;
}
