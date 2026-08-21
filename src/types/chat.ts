export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  readonly conversationId: string;
  readonly seq: number;
  readonly role: ChatRole;
  readonly content: string;
  readonly partial: boolean;
  readonly createdAt: number;
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
