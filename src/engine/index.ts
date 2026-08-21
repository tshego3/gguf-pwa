// Public engine surface. Exactly these six functions, per the engineering
// rule: everything above src/engine/ talks to wllama only through this
// barrel, and no other file in the tree may import @wllama/wllama.
export { loadModel, unloadModel, chat, abort, countTokens, capabilities } from './client';
export type { EngineChatMessage, EngineChatParams } from './protocol';
