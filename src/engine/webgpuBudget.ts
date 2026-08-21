// Decides n_gpu_layers before a model has been loaded, so the only
// information available is total model bytes and the adapter's reported
// buffer limits - there is no per-layer VRAM cost yet (that needs GGUF
// metadata, which is only readable mid-load). Given that, this applies a
// full-or-none policy: offload everything if the model comfortably fits the
// reported ceilings, otherwise fall back to pure CPU/WASM for this load
// rather than guess a partial layer count that could still exceed VRAM.
// A true proportional hybrid needs a real device's per-layer measurement,
// which no physical hardware in this environment has produced yet.
const FULL_OFFLOAD_LAYERS = 999;
const NO_OFFLOAD_LAYERS = 0;
const SAFETY_MARGIN = 0.9;

export function resolveGpuLayers(
  modelBytes: number,
  maxBufferSize: number | null,
  maxStorageBufferBindingSize: number | null,
): number {
  if (maxBufferSize === null || maxStorageBufferBindingSize === null) {
    return FULL_OFFLOAD_LAYERS;
  }

  const ceiling = Math.min(maxBufferSize, maxStorageBufferBindingSize) * SAFETY_MARGIN;
  return modelBytes <= ceiling ? FULL_OFFLOAD_LAYERS : NO_OFFLOAD_LAYERS;
}
