// Vendored into the build - never fetched from a CDN. wllama ships
// wasm-from-cdn.ts as a convenience default that points at a public CDN;
// using it would add a third-party runtime dependency, complicate the CSP,
// and break offline start, so this imports the binary that Vite bundles
// and serves from this origin instead (P3-T1).
import wllamaWasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';

export const WASM_PATH_CONFIG = { default: wllamaWasmUrl };
