// Public engine surface. The wllama worker and the optional online API
// both sit behind exactly these functions, per the engineering rule:
// everything above src/engine/ talks to a backend only through this
// barrel, and no other file in the tree may import @wllama/wllama.
export {
  loadModel,
  unloadModel,
  activateRemote,
  deactivateRemote,
  chat,
  abort,
  countTokens,
  capabilities,
} from './client';
export type { EngineChatMessage, EngineChatParams } from './protocol';
